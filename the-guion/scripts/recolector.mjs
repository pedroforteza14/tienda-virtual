#!/usr/bin/env node
/**
 * Recolector semanal de THE GUION.
 *
 * Lee las piezas publicadas por las cuentas de config/creadores.json usando el
 * endpoint business_discovery de la Instagram Graph API, y devuelve un array
 * JSON listo para pegar en el tablero (pestaña "Cargar datos").
 *
 * Requiere dos variables de entorno:
 *   IG_TOKEN    token de acceso de Facebook con instagram_basic + pages_read_engagement
 *   IG_USER_ID  id de tu cuenta de Instagram de tipo Empresa/Creador
 *
 * Uso:
 *   node scripts/recolector.mjs                      # ultimos 7 dias
 *   node scripts/recolector.mjs --dias 14            # ultimos 14 dias
 *   node scripts/recolector.mjs --salida semana.json # escribe a archivo
 *   node scripts/recolector.mjs --quien-soy          # averigua tu IG_USER_ID
 *
 * Limitacion real de la API, no del script: business_discovery devuelve
 * comentarios y likes de cuentas publicas de tipo Empresa/Creador, pero NO
 * devuelve reproducciones. El campo "vistas" sale en 0 y se completa a mano
 * en el tablero si hace falta. Una cuenta personal o privada no devuelve nada.
 */

const VERSION = process.env.GRAPH_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const flag = (n, def = null) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const dias = Number(flag("--dias", "7")) || 7;
const salida = flag("--salida");
const quienSoy = args.includes("--quien-soy");
const limite = Number(flag("--limite", "25")) || 25;

function morir(msg) {
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

if (!TOKEN) {
  morir(
    "Falta IG_TOKEN.\n" +
    "  Guardalo como secreto del entorno (no lo pegues en el chat ni en el repo)\n" +
    "  y mira README.md -> 'Conseguir el token' para los pasos."
  );
}

async function pedir(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (j.error) {
    const e = j.error;
    const err = new Error(e.message || "error de la Graph API");
    err.code = e.code;
    err.subcode = e.error_subcode;
    throw err;
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return j;
}

/* ---------- --quien-soy: encontrar el IG_USER_ID ---------- */
async function descubrirIdentidad() {
  const u = new URL(`${BASE}/me/accounts`);
  u.searchParams.set("fields", "name,instagram_business_account{id,username}");
  u.searchParams.set("access_token", TOKEN);
  const j = await pedir(u);
  const paginas = j.data || [];
  if (!paginas.length) {
    morir(
      "El token no ve ninguna pagina de Facebook.\n" +
      "  Revisa que le hayas dado los permisos pages_show_list y instagram_basic."
    );
  }
  console.log("\nPaginas que ve este token:\n");
  let encontrado = false;
  for (const p of paginas) {
    const ig = p.instagram_business_account;
    if (ig) {
      encontrado = true;
      console.log(`  ${p.name}`);
      console.log(`    IG_USER_ID=${ig.id}   (@${ig.username || "?"})\n`);
    } else {
      console.log(`  ${p.name}\n    sin cuenta de Instagram de empresa vinculada\n`);
    }
  }
  if (!encontrado) {
    console.log(
      "  Ninguna pagina tiene una cuenta de Instagram de empresa vinculada.\n" +
      "  Vincula tu cuenta de IG (tipo Empresa o Creador) a una pagina de Facebook\n" +
      "  y volve a correr este comando.\n"
    );
  }
}

/* ---------- traer las piezas de una cuenta ---------- */
async function traerCuenta(handle) {
  const campos =
    `business_discovery.username(${handle})` +
    `{followers_count,media_count,media.limit(${limite})` +
    `{id,caption,like_count,comments_count,media_type,permalink,timestamp}}`;
  const u = new URL(`${BASE}/${IG_USER_ID}`);
  u.searchParams.set("fields", campos);
  u.searchParams.set("access_token", TOKEN);
  const j = await pedir(u);
  const bd = j.business_discovery;
  if (!bd) throw new Error("la respuesta no trajo business_discovery");
  return {
    seguidores: bd.followers_count ?? null,
    piezas: (bd.media && bd.media.data) || [],
  };
}

/* ---------- semana ISO 8601 ---------- */
function isoSemana(fecha) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const anio = d.getUTCFullYear();
  const ene1 = new Date(Date.UTC(anio, 0, 1));
  const n = Math.ceil(((d - ene1) / 86400000 + 1) / 7);
  return anio + "-W" + String(n).padStart(2, "0");
}

/* ---------- principal ---------- */
async function main() {
  if (quienSoy) return descubrirIdentidad();

  if (!IG_USER_ID) {
    morir(
      "Falta IG_USER_ID.\n" +
      "  Corre:  node scripts/recolector.mjs --quien-soy\n" +
      "  y guarda el valor que te imprima como secreto del entorno."
    );
  }

  const { readFile, writeFile } = await import("node:fs/promises");
  const cfgPath = new URL("../config/creadores.json", import.meta.url);
  let cuentas;
  try {
    cuentas = JSON.parse(await readFile(cfgPath, "utf8"));
  } catch {
    morir("No pude leer config/creadores.json");
  }
  const activas = cuentas.filter((c) => c.activo !== false);
  if (!activas.length) morir("No hay cuentas activas en config/creadores.json");

  const desde = Date.now() - dias * 86400000;
  const filas = [];
  const problemas = [];

  for (const c of activas) {
    const handle = String(c.handle).replace(/^@/, "");
    process.stderr.write(`  consultando @${handle} ... `);
    try {
      const { seguidores, piezas } = await traerCuenta(handle);
      const recientes = piezas.filter((p) => p.timestamp && Date.parse(p.timestamp) >= desde);
      for (const p of recientes) {
        const fecha = String(p.timestamp).slice(0, 10);
        filas.push({
          handle,
          url: p.permalink || "",
          fecha,
          semana: isoSemana(new Date(p.timestamp)),
          comentarios: Number(p.comments_count) || 0,
          likes: Number(p.like_count) || 0,
          vistas: 0, // la API no lo da para cuentas de terceros
          caption: (p.caption || "").slice(0, 900),
          tipo: p.media_type || "",
          seguidores_cuenta: seguidores,
        });
      }
      process.stderr.write(`${recientes.length} piezas en ${dias} dias\n`);
    } catch (e) {
      let pista = e.message;
      if (e.code === 110 || /does not exist|Invalid user/i.test(e.message)) {
        pista = "handle inexistente, o la cuenta no es de tipo Empresa/Creador, o es privada";
      } else if (e.code === 190) {
        pista = "token vencido o invalido: generalo de nuevo";
      } else if (e.code === 4 || e.code === 17) {
        pista = "limite de uso de la API alcanzado: espera un rato";
      }
      process.stderr.write(`FALLO (${pista})\n`);
      problemas.push({ handle, error: pista });
    }
  }

  filas.sort((a, b) => b.comentarios - a.comentarios);

  const json = JSON.stringify(filas, null, 2);
  if (salida) {
    await writeFile(salida, json, "utf8");
    process.stderr.write(`\n  Escrito en ${salida}: ${filas.length} piezas.\n`);
  } else {
    console.log(json);
  }

  if (problemas.length) {
    process.stderr.write("\n  Cuentas que no devolvieron datos:\n");
    for (const p of problemas) process.stderr.write(`    @${p.handle}: ${p.error}\n`);
  }
  if (filas.length) {
    const top = filas[0];
    process.stderr.write(
      `\n  Mas comentada: @${top.handle} con ${top.comentarios} comentarios (${top.fecha}).\n` +
      `  Pega este JSON en el tablero, pestaña "Cargar datos".\n\n`
    );
  } else {
    process.stderr.write(`\n  Ninguna pieza en los ultimos ${dias} dias.\n\n`);
  }
}

main().catch((e) => morir("Error inesperado: " + e.message));

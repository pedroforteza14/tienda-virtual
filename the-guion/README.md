# THE GUION · Radar semanal

Sistema para detectar qué contenido del nicho Meta Ads junta más comentarios cada
semana y convertirlo en guiones propios para reels, sin que queden iguales al
original.

Tres piezas:

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| **Tablero** | Artifact publicado (link privado) | Ranking semanal por comentarios, banco de guiones, perfil de voz, medidor anti-clon |
| **Recolector** | `scripts/recolector.mjs` | Trae comentarios y likes de las cuentas seguidas vía Instagram Graph API |
| **Doctrina** | `voz/anti-clon.md` | Las reglas de reescritura que usa el tablero |

## El ritual semanal

1. Correr el recolector (o esperar que corra solo, ver más abajo).
2. Pegar su salida en el tablero → pestaña **Cargar datos**.
3. Mirar el ranking en **Tablero**: quién juntó más comentarios y con qué tema.
4. Elegir una pieza → **Reescribir** → revisar que el medidor anti-clon marque 0%.
5. Guardar el guión y grabarlo.

## Qué se puede leer de Instagram, y qué no

El recolector usa el endpoint `business_discovery` de la Instagram Graph API. Es
la vía oficial y gratuita para leer cuentas de terceros.

**Devuelve:** cantidad de comentarios, likes, caption, link, fecha, tipo de
media, y seguidores de la cuenta.

**No devuelve:**

- **Reproducciones de cuentas ajenas.** El campo `vistas` sale en 0 y queda para
  completar a mano si te interesa la tasa de comentarios por mil vistas.
- **El texto de los comentarios.** Solo el número.
- **Cuentas personales o privadas.** La cuenta consultada tiene que ser pública y
  de tipo Empresa o Creador. Una cuenta personal devuelve error, no datos vacíos.

Tus propias métricas (las de Insights de tu cuenta) son otra cosa y cubren solo tu
contenido: no sirven para mirar a los demás. Por eso el token se usa como
*identidad que consulta*, no para leer tus estadísticas.

## Conseguir el token

Hace falta una vez. Necesitás tu cuenta de Instagram en tipo **Empresa** o
**Creador**, vinculada a una página de Facebook.

1. Entrá a [developers.facebook.com](https://developers.facebook.com) → **Mis
   apps** → **Crear app**. Tipo: *Otro* → *Negocio*.
2. Abrí la **Herramienta de exploración de la API Graph** (Graph API Explorer),
   arriba a la derecha elegí tu app.
3. En *Permisos*, agregá: `instagram_basic`, `pages_show_list`,
   `pages_read_engagement`.
4. **Generar token de acceso** y aceptar el diálogo de Facebook.
5. Averiguá tu id de Instagram con el propio recolector:

   ```bash
   IG_TOKEN='el-token' node scripts/recolector.mjs --quien-soy
   ```

   Te imprime el `IG_USER_ID` de cada página con Instagram vinculado.

6. El token del explorador dura una o dos horas. Para que sirva todas las semanas,
   cambialo por uno de ~60 días:

   ```
   GET https://graph.facebook.com/v23.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=TU_APP_ID
     &client_secret=TU_APP_SECRET
     &fb_exchange_token=EL_TOKEN_CORTO
   ```

   Hay que renovarlo cada ~50 días. Cuando vence, el recolector avisa con
   "token vencido o invalido".

### Dónde guardarlo

El token es una credencial: **no va en el chat, ni en el repo, ni en un archivo
del proyecto.** Guardalo en la configuración del entorno de la sesión — menú del
entorno en la barra de título, **Edit** → sección **Network secrets** (en algunas
versiones aparece como *API credentials*), o como variable de entorno si esa
sección no está.

Los nombres que lee el recolector son exactamente:

```
IG_TOKEN
IG_USER_ID
```

Una sesión nueva los toma automáticamente.

## Usar el recolector

```bash
node scripts/recolector.mjs                        # últimos 7 días, a pantalla
node scripts/recolector.mjs --dias 14              # últimos 14 días
node scripts/recolector.mjs --salida semana.json   # a archivo
node scripts/recolector.mjs --limite 50            # mirar más piezas por cuenta
node scripts/recolector.mjs --quien-soy            # averiguar el IG_USER_ID
```

Node 18 o superior, sin dependencias que instalar. Sale ordenado por comentarios,
de mayor a menor, y avisa por separado qué cuentas no devolvieron nada y por qué.

## Las cuentas seguidas

Se editan en dos lugares, y conviene mantenerlos iguales:

- `config/creadores.json` → lo que consulta el recolector.
- Pestaña **Cuentas** del tablero → lo que ves en pantalla.

## El tablero

**Tablero** — Tiles de resumen (piezas analizadas, comentarios juntados, la más
comentada, comentarios por mil vistas) y el ranking de la semana. Los números son
los que cargaste: el tablero no estima ni completa nada solo.

**Guiones** — A la izquierda el material original; a la derecha tu versión. El
botón *Reescribir en mi voz* arma el guión con el perfil de voz y las siete
reglas anti-clon. El guión es editable antes de guardarlo.

**Medidor anti-clon** — Mide qué proporción de las secuencias de 6 palabras del
guión nuevo ya estaban en el original, y nombra las repetidas. 0% es el objetivo.
Es un cálculo del propio tablero, no una opinión de un modelo.

**Mi voz** — El cuestionario que alimenta la reescritura: tratamiento, audiencia,
nivel técnico, energía, muletillas propias, palabras prohibidas, cómo abrís, cómo
cerrás, tu opinión fuerte repetida y la duración objetivo. Se guarda solo. Cuanto
más completo, menos genérico sale el guión.

**Cuentas** y **Cargar datos** — Lo que sus nombres dicen.

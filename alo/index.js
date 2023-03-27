
let nombre = prompt("Ingrese su nombre: ");
let direccion = prompt("Ingrese su dirección: ");
let telefono = prompt("Ingrese su número de teléfono: ");


let producto1 = prompt("Ingrese el nombre del primer producto: ");
let precio1 = parseFloat(prompt("Ingrese el precio del primer producto: "));
let cantidad1 = parseInt(prompt("Ingrese la cantidad del primer producto: "));

let producto2 = prompt("Ingrese el nombre del segundo producto: ");
let precio2 = parseFloat(prompt("Ingrese el precio del segundo producto: "));
let cantidad2 = parseInt(prompt("Ingrese la cantidad del segundo producto: "));


let total = (precio1 * cantidad1) + (precio2 * cantidad2);


console.log("\nResumen de la compra:");
console.log(`Nombre: ${nombre}`);
console.log(`Dirección: ${direccion}`);
console.log(`Teléfono: ${telefono}`);
console.log(`Producto 1: ${producto1} x ${cantidad1} = $${precio1 * cantidad1}`);
console.log(`Producto 2: ${producto2} x ${cantidad2} = $${precio2 * cantidad2}`);
console.log(`Total de la compra: $${total}`);

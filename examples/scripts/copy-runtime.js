/**
 * Script para copiar el runtime de NodeWire a la carpeta public del ejemplo
 */
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../../lib/public/js/nodewire-runtime.js');
const destPath = path.join(__dirname, '../public/js/nodewire-runtime.js');
const destDir = path.join(__dirname, '../public/js');

// Crear directorio si no existe
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Copiar archivo
if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log('✅ Runtime de NodeWire copiado correctamente');
} else {
    console.warn('⚠️  No se encontró el runtime en:', sourcePath);
    console.warn('   Asegúrate de que el framework esté compilado');
}


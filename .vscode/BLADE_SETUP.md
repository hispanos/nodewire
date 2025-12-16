# Configuración de Blade para VS Code

## Opción 1: Usar HTML (Ya configurado) ✅

Los archivos `.view` ya están configurados para usar el resaltado de sintaxis HTML. Esto te dará:
- ✅ Coloreado de sintaxis HTML
- ✅ Indentación automática
- ✅ Formateo de código
- ✅ Autocompletado HTML
- ✅ Emmet funciona

**Las directivas Blade (`@if`, `@yield`, etc.) aparecerán como texto normal**, pero el HTML funcionará perfectamente.

## Opción 2: Instalar extensión de Blade del Marketplace (Recomendado) 🎨

Para obtener coloreado completo de las directivas Blade:

1. Abre VS Code
2. Presiona `Ctrl+Shift+X` para abrir el panel de extensiones
3. Busca "Blade" o "Laravel Blade"
4. Instala una de estas extensiones:
   - **"Blade"** por shufo (ID: `shufo.vscode-blade-formatter`)
   - **"Laravel Blade Snippets"** por WinnieLin (ID: `onecentlin.laravel-blade`)
   - **"Laravel Blade"** por amiralizadeh9480 (ID: `amiralizadeh9480.laravel-blade`)

5. Después de instalar, actualiza `.vscode/settings.json` para usar `blade` en lugar de `html`:

```json
{
  "files.associations": {
    "*.view": "blade"
  }
}
```

## Opción 3: Usar la extensión local (Avanzado)

Si prefieres usar la extensión local que creamos:

1. Instala `vsce` globalmente:
   ```bash
   npm install -g vsce
   ```

2. Navega a la carpeta de la extensión:
   ```bash
   cd .vscode/blade-language
   ```

3. Empaqueta la extensión:
   ```bash
   vsce package
   ```

4. Instala el archivo `.vsix` generado:
   - Presiona `Ctrl+Shift+P`
   - Escribe "Extensions: Install from VSIX..."
   - Selecciona el archivo `.vsix` generado

## Estado Actual

✅ **Configurado**: Los archivos `.view` se reconocen como HTML
✅ **Formateo**: Activado al guardar
✅ **Indentación**: 4 espacios, auto-indentación completa
✅ **Emmet**: Funciona en archivos `.view`

⚠️ **Pendiente**: Coloreado específico de directivas Blade (requiere extensión del marketplace)

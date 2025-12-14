# Ejemplo de Uso - Framework MVC con NodeWire

Este es un ejemplo de cómo usar el framework MVC con NodeWire.

## 🚀 Instalación

```bash
npm install
```

## 🏃 Ejecutar

### Modo desarrollo (con recarga automática)
```bash
npm run dev
```

### Compilar TypeScript
```bash
npm run build
```

### Ejecutar producción
```bash
npm start
```

El servidor se iniciará en `http://localhost:3000`

## 📁 Estructura

```
examples/
├── src/
│   ├── app/
│   │   └── Components/
│   │       └── CounterComponent.ts  # Componente de ejemplo
│   └── index.ts                     # Punto de entrada
├── resources/
│   └── views/
│       ├── welcome.ejs              # Vista principal
│       └── components/
│           └── counter.ejs          # Vista del componente
├── public/
│   └── js/
│       └── nodewire-runtime.js     # Runtime JavaScript (copiar desde lib/public/js/)
└── package.json
```

## 🎯 Componente de Ejemplo

Este ejemplo incluye un `CounterComponent` que demuestra:
- Estado reactivo (`count`)
- Métodos invocables desde el cliente (`increment`, `decrement`, `reset`)
- Renderizado del componente con EJS
- Sincronización automática con el cliente

## 📝 Notas

- Asegúrate de que el archivo `public/js/nodewire-runtime.js` existe
- Las vistas deben estar en `resources/views/`
- Los componentes deben estar registrados antes de usarlos


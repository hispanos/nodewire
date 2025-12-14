# Ejemplo de Uso - Framework MVC con NodeWire

Este es un ejemplo completo de cómo usar el Framework MVC con NodeWire.

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# O compilar y ejecutar
npm run build
npm start
```

Luego visita `http://localhost:3000` en tu navegador.

## 📁 Estructura del Ejemplo

```
examples/
├── src/
│   ├── app/
│   │   ├── controllers/
│   │   │   └── HomeController.ts    # Controlador de ejemplo
│   │   └── Components/
│   │       └── CounterComponent.ts   # Componente NodeWire de ejemplo
│   └── index.ts                      # Punto de entrada
├── resources/
│   └── views/
│       ├── welcome.hbs              # Vista principal
│       └── components/
│           └── counter.hbs          # Vista del componente
├── public/
│   └── js/
│       └── nodewire-runtime.js      # Runtime JavaScript (copiado desde lib/public/js)
└── package.json
```

## 📝 Código del Ejemplo

### 1. Punto de Entrada (`src/index.ts`)

```typescript
import { Application, Router } from 'framework-mvc-nodewire';
import { HomeController } from './app/controllers/HomeController';

// Crear aplicación con valores por defecto
const app = new Application();

// Configurar rutas
const router = new Router();
router.get('/', HomeController, 'index');

app.use(router);

// Iniciar servidor
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
```

### 2. Controlador (`src/app/controllers/HomeController.ts`)

```typescript
import { BaseController } from 'framework-mvc-nodewire';
import { CounterComponent } from '../Components/CounterComponent';

export class HomeController extends BaseController {
    // Declarar componentes que este controlador necesita
    protected static components = {
        'CounterComponent': CounterComponent
    };

    public async index() {
        // Crear componente con argumentos nombrados
        const counterComponent = this.components.CounterComponent({ initialValue: 0 });
        
        // Renderizar vista
        this.render('welcome', {
            title: 'Framework MVC con NodeWire',
            counterComponent: counterComponent
        });
    }
}
```

### 3. Componente NodeWire (`src/app/Components/CounterComponent.ts`)

```typescript
import { Component } from 'framework-mvc-nodewire';

export class CounterComponent extends Component {
    public count: number = 0;

    constructor(initialValue: number = 0, id?: string) {
        super('CounterComponent', id);
        this.count = initialValue;
    }

    public increment(): void {
        this.count += 1;
        console.log(`[CounterComponent] Incrementado a ${this.count}`);
    }

    public decrement(): void {
        this.count -= 1;
        console.log(`[CounterComponent] Decrementado a ${this.count}`);
    }

    public reset(): void {
        this.count = 0;
        console.log(`[CounterComponent] Reset a 0`);
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/counter', { component: this });
    }
}
```

### 4. Vista Principal (`resources/views/welcome.hbs`)

```handlebars
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        /* Estilos... */
    </style>
</head>
<body>
    <div class="container">
        <h1>{{title}}</h1>
        <p>Framework MVC inspirado en Laravel con NodeWire (similar a Livewire)</p>
        
        <div class="component-demo">
            {{> components/counter component=counterComponent}}
        </div>
    </div>

    <script src="/js/nodewire-runtime.js"></script>
</body>
</html>
```

### 5. Vista del Componente (`resources/views/components/counter.hbs`)

```handlebars
{{!-- Helper para generar el estado automáticamente --}}
{{{nodewireState component}}}

<div style="text-align: center; padding: 30px; background: #f8f9fa; border-radius: 10px;">
    <h2>Contador NodeWire</h2>
    
    {{!-- El sistema detecta automáticamente elementos que contienen valores del componente --}}
    {{!-- Solo necesitas usar {{component.count}} y el sistema lo marca automáticamente --}}
    <div style="font-size: 48px; font-weight: bold; color: #667eea; margin: 20px 0;">
        {{component.count}}
    </div>

    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        {{!-- Los botones solo necesitan data-nw-click --}}
        <button data-nw-click="decrement">-</button>
        <button data-nw-click="reset">Reset</button>
        <button data-nw-click="increment">+</button>
    </div>
</div>
```

## 🎯 Características Demostradas

Este ejemplo demuestra:

1. **Configuración simplificada**: No necesitas configurar rutas manualmente
2. **Registro automático de componentes**: Los componentes se registran automáticamente
3. **Rutas simplificadas**: `router.get('/', HomeController, 'index')`
4. **Detección automática**: `{{component.count}}` se marca automáticamente
5. **Comunicación WebSocket**: Actualizaciones en tiempo real (con fallback HTTP)
6. **Sintaxis Handlebars**: Plantillas limpias y legibles

## 🔍 Cómo Funciona

1. **Renderizado Inicial**: El servidor renderiza el componente con Handlebars
2. **Auto-marcado**: El sistema detecta automáticamente elementos con valores del componente
3. **Estado del Cliente**: Se genera un script JSON con el estado del componente
4. **Interacción**: El usuario hace clic en un botón con `data-nw-click`
5. **Comunicación**: El runtime JavaScript envía una petición WebSocket (o HTTP) al servidor
6. **Actualización**: El servidor ejecuta el método, actualiza el estado y devuelve el HTML actualizado
7. **DOM Update**: El cliente actualiza solo los elementos que cambiaron

## 🛠️ Comandos Disponibles

```bash
# Desarrollo con hot reload
npm run dev

# Compilar TypeScript
npm run build

# Ejecutar producción
npm start

# Limpiar build
npm run clean
```

## 📚 Más Información

Para más detalles sobre el framework, consulta el [README principal](../README.md).

## 🐛 Solución de Problemas

### El componente no se actualiza

1. Verifica que el archivo `nodewire-runtime.js` esté en `public/js/`
2. Revisa la consola del navegador para errores
3. Verifica que el componente esté registrado en el controlador
4. Asegúrate de que la vista use `{{component.propiedad}}` o el helper `wire()`

### Error: "Componente no está registrado"

Asegúrate de declarar el componente en el controlador:

```typescript
protected static components = {
    'CounterComponent': CounterComponent
};
```

### Error: "Partial no encontrado"

Verifica que el partial esté en la ruta correcta:
- `resources/views/components/counter.hbs` para `{{> components/counter}}`

## 📄 Licencia

MIT

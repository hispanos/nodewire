# Framework MVC con NodeWire

Framework web inspirado en Laravel, construido con Node.js y TypeScript, que incluye **NodeWire** - un sistema similar a Livewire para crear componentes interactivos sin escribir JavaScript del lado del cliente.

## 📁 Estructura del Proyecto

```
framework/
├── lib/                    # Código del framework (publicable)
│   ├── core/              # Núcleo del framework
│   │   ├── Application.ts  # Clase principal de la aplicación
│   │   ├── Router.ts       # Sistema de rutas
│   │   └── BaseController.ts # Controlador base
│   ├── nodewire/          # Sistema NodeWire
│   │   ├── Component.ts   # Clase base para componentes
│   │   └── NodeWireManager.ts # Gestor de componentes
│   ├── public/            # Archivos estáticos del framework
│   │   └── js/
│   │       └── nodewire-runtime.js # Runtime JavaScript del cliente
│   └── index.ts           # Exportaciones principales
├── examples/               # Ejemplo de uso
│   ├── src/
│   │   ├── app/
│   │   │   ├── controllers/ # Controladores
│   │   │   └── Components/ # Componentes de ejemplo
│   │   └── index.ts       # Punto de entrada del ejemplo
│   ├── resources/
│   │   └── views/         # Plantillas Handlebars (.hbs)
│   ├── public/           # Archivos estáticos del ejemplo
│   └── package.json
└── package.json           # Configuración del framework
```

## 🚀 Instalación

### Como paquete npm (cuando esté publicado)

```bash
npm install framework-mvc-nodewire
```

### Desarrollo local

```bash
# Instalar dependencias del framework
npm install

# Compilar el framework
npm run build

# Instalar dependencias del ejemplo
cd examples
npm install

# Ejecutar el ejemplo
npm run dev
```

## 📦 Uso del Framework

### 1. Crear una aplicación (con valores por defecto)

```typescript
import { Application, Router } from 'framework-mvc-nodewire';

// Valores por defecto:
// - views: resources/views
// - controllers: app/controllers
// - models: app/models
// - public: public
const app = new Application();
```

### 2. Crear un controlador

```typescript
import { BaseController } from 'framework-mvc-nodewire';
import { CounterComponent } from '../Components/CounterComponent';

export class HomeController extends BaseController {
    // Declarar componentes que este controlador necesita
    protected static components = {
        'CounterComponent': CounterComponent
    };

    public async index() {
        // Acceder a componentes con argumentos nombrados
        const counterComponent = this.components.CounterComponent({ initialValue: 0 });
        
        this.render('welcome', {
            title: 'Mi Aplicación',
            counterComponent: counterComponent
        });
    }
}
```

### 3. Crear un componente NodeWire

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
    }

    public decrement(): void {
        this.count -= 1;
    }

    public reset(): void {
        this.count = 0;
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/counter', { component: this });
    }
}
```

### 4. Configurar rutas (súper simple!)

```typescript
import { Router } from 'framework-mvc-nodewire';
import { HomeController } from './app/controllers/HomeController';

const router = new Router();

// Solo necesitas pasar la clase del controlador y el método
// El Router se encarga de todo: crear instancia, registrar componentes, hacer bind
router.get('/', HomeController, 'index');

app.use(router);
app.listen(3000);
```

### 5. Crear la vista con Handlebars

```handlebars
{{!-- resources/views/welcome.hbs --}}
<!DOCTYPE html>
<html>
<head>
    <title>{{title}}</title>
</head>
<body>
    <h1>{{title}}</h1>
    
    {{!-- Incluir el componente --}}
    {{> components/counter component=counterComponent}}
    
    <script src="/js/nodewire-runtime.js"></script>
</body>
</html>
```

### 6. Crear la vista del componente

```handlebars
{{!-- resources/views/components/counter.hbs --}}
{{!-- Helper para generar el estado automáticamente --}}
{{{nodewireState component}}}

<div style="text-align: center; padding: 30px;">
    <h2>Contador NodeWire</h2>
    
    {{!-- El sistema detecta automáticamente elementos que contienen valores del componente --}}
    {{!-- Solo necesitas usar {{component.count}} y el sistema lo marca automáticamente --}}
    <div style="font-size: 48px; font-weight: bold;">
        {{component.count}}
    </div>

    <div style="display: flex; gap: 10px; justify-content: center;">
        {{!-- Los botones solo necesitan data-nw-click --}}
        <button data-nw-click="decrement">-</button>
        <button data-nw-click="reset">Reset</button>
        <button data-nw-click="increment">+</button>
    </div>
</div>
```

## ✨ Características Principales

### 🎯 Sintaxis Simplificada

**Antes (con helper manual):**
```handlebars
{{{wire 'count' component.count}}}
```

**Ahora (detección automática):**
```handlebars
{{component.count}}
```

El sistema detecta automáticamente elementos que contienen valores del componente y los marca con los atributos necesarios para NodeWire.

### 🚀 Configuración Simplificada

**Antes:**
```typescript
const app = new Application({
    viewsPath: path.join(__dirname, 'resources/views'),
    publicPath: path.join(__dirname, 'public'),
    staticPath: path.join(__dirname, 'public')
});
```

**Ahora:**
```typescript
const app = new Application(); // Usa valores por defecto
```

### 🎨 Rutas Simplificadas

**Antes:**
```typescript
const nodeWireManager = app.getNodeWireManager();
const homeController = BaseController.createProxy(new HomeController(), nodeWireManager);
router.get('/', homeController.index);
```

**Ahora:**
```typescript
router.get('/', HomeController, 'index');
```

### 🔄 Registro Automático de Componentes

Los componentes se registran automáticamente cuando se declaran en el controlador:

```typescript
export class HomeController extends BaseController {
    protected static components = {
        'CounterComponent': CounterComponent
    };
    // El componente se registra automáticamente, no necesitas hacer nada más
}
```

## 🎯 Características

- **Arquitectura MVC**: Patrón Modelo-Vista-Controlador
- **NodeWire**: Sistema de componentes reactivos similar a Livewire
- **Motor de plantillas Handlebars**: Sintaxis intuitiva y limpia
- **TypeScript**: Tipado estático para mayor seguridad
- **Express.js**: Servidor web robusto
- **WebSockets**: Comunicación en tiempo real (con fallback HTTP)
- **Configuración por defecto**: Rutas automáticas sin configuración
- **Detección automática**: Marca elementos automáticamente sin helpers manuales
- **BaseController**: Controlador base con funcionalidades integradas

## 🔧 API del Framework

### Application

```typescript
interface ApplicationConfig {
    viewsPath?: string;      // Default: process.cwd()/resources/views
    publicPath?: string;     // Default: process.cwd()/public
    staticPath?: string;     // Default: process.cwd()/public
    controllersPath?: string; // Default: process.cwd()/app/controllers
    modelsPath?: string;     // Default: process.cwd()/app/models
    basePath?: string;       // Default: process.cwd()
}

const app = new Application(config); // config es opcional
app.use(router);
app.listen(3000);
```

### Router

```typescript
const router = new Router();

// Opción 1: Super simple (recomendado)
router.get('/', HomeController, 'index');

// Opción 2: Con instancia ya creada
const controller = BaseController.createProxy(new HomeController(), nodeWireManager);
router.get('/', controller.index);

// Opción 3: Handler directo
router.get('/', (req, res) => { /* ... */ });
```

### BaseController

```typescript
abstract class BaseController {
    public req: Request | null;
    public res: Response | null;
    
    // Declarar componentes
    protected static components: Record<string, ComponentConstructor> = {};
    
    // Acceder a componentes
    protected get components(): Record<string, (options?: Record<string, any>) => Component>;
    
    // Métodos helper
    protected render(view: string, data?: any): void;
    protected json(data: any, status?: number): void;
}
```

### Component

```typescript
abstract class Component {
    public id: string;
    public readonly name: string;
    
    abstract render(templateEngine: any): string;
    getState(): Record<string, any>;
    setState(state: Record<string, any>): void;
}
```

### Helpers de Handlebars

NodeWire proporciona helpers automáticos para Handlebars:

- `{{nodewireState component}}` - Genera el script de estado del componente
- `{{nodewireId component}}` - Obtiene el ID del componente
- `{{nodewireComponent component}}` - Obtiene el nombre del componente
- `{{component.propiedad}}` - Se marca automáticamente (no necesitas helper)

## 📝 Ejemplo Completo

Ver la carpeta `examples/` para un ejemplo completo y funcional.

## 🎨 Próximas Mejoras

- [ ] Soporte para eventos personalizados
- [ ] Validación de formularios
- [ ] Sistema de sesiones persistente
- [ ] Optimización de actualizaciones del DOM (diffing mejorado)
- [ ] Soporte para múltiples componentes en la misma página
- [ ] Script de instalación para copiar el runtime JS automáticamente
- [ ] Hot reload para desarrollo

## 📄 Licencia

MIT

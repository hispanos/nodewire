# Framework MVC con NodeWire

Framework web inspirado en Laravel, construido con Node.js y TypeScript, que incluye **NodeWire** - un sistema similar a Livewire para crear componentes interactivos sin escribir JavaScript del lado del cliente.

## 📁 Estructura del Proyecto

```
framework/
├── lib/                    # Código del framework (publicable)
│   ├── core/              # Núcleo del framework
│   │   ├── Application.ts  # Clase principal de la aplicación
│   │   └── Router.ts       # Sistema de rutas
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
│   │   │   └── Components/ # Componentes de ejemplo
│   │   └── index.ts       # Punto de entrada del ejemplo
│   ├── resources/
│   │   └── views/         # Plantillas EJS
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

### 1. Importar el framework

```typescript
import { Application, Router, Component, NodeWireManager } from 'framework-mvc-nodewire';
```

### 2. Crear una aplicación

```typescript
import path from 'path';
import { Application, Router } from 'framework-mvc-nodewire';

const app = new Application({
    viewsPath: path.join(__dirname, 'resources/views'),
    publicPath: path.join(__dirname, 'public'),
    staticPath: path.join(__dirname, 'public')
});
```

### 3. Crear un componente NodeWire

```typescript
import { Component } from 'framework-mvc-nodewire';

export class MiComponente extends Component {
    public mensaje: string = 'Hola';

    constructor(id?: string) {
        super('MiComponente', id);
    }

    public cambiarMensaje(): void {
        this.mensaje = 'Mensaje cambiado!';
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/mi-componente', { component: this });
    }
}
```

### 4. Registrar y usar el componente

```typescript
// Registrar el componente
const nodeWireManager = app.getNodeWireManager();
nodeWireManager.registerComponent('MiComponente', MiComponente);

// En una ruta
router.get('/', (req, res) => {
    const componente = nodeWireManager.createComponent('MiComponente');
    res.render('mi-vista', { componente });
});
```

### 5. Crear la vista del componente

```ejs
<!-- resources/views/components/mi-componente.ejs -->
<div 
    data-nodewire-id="<%= component.id %>"
    data-nodewire-state='<%= JSON.stringify(component.getState()) %>'
    data-nodewire-name="<%= component.name %>"
>
    <p><%= component.mensaje %></p>
    <button data-nw-click="cambiarMensaje">Cambiar</button>
</div>
```

### 6. Incluir el runtime JavaScript

```ejs
<!-- En tu layout principal -->
<script src="/js/nodewire-runtime.js"></script>
```

**Nota**: Cuando instales el paquete, copia el archivo `node_modules/framework-mvc-nodewire/lib/public/js/nodewire-runtime.js` a tu carpeta `public/js/`.

## 🎯 Características

- **Arquitectura MVC**: Patrón Modelo-Vista-Controlador
- **NodeWire**: Sistema de componentes reactivos similar a Livewire
- **Motor de plantillas EJS**: Para renderizar vistas
- **TypeScript**: Tipado estático para mayor seguridad
- **Express.js**: Servidor web robusto
- **Configuración flexible**: Rutas personalizables para vistas y archivos estáticos

## 🔧 API del Framework

### Application

```typescript
interface ApplicationConfig {
    viewsPath?: string;    // Ruta a las vistas (default: process.cwd()/resources/views)
    publicPath?: string;    // Ruta a archivos públicos
    staticPath?: string;    // Ruta para archivos estáticos (default: process.cwd()/public)
}

const app = new Application(config);
app.use(router);
app.listen(3000);
```

### Router

```typescript
const router = new Router();
router.get('/ruta', (req, res) => { /* ... */ });
router.post('/ruta', (req, res) => { /* ... */ });
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

### NodeWireManager

```typescript
const manager = app.getNodeWireManager();
manager.registerComponent('Nombre', ComponentClass);
const component = manager.createComponent('Nombre', ...args);
```

## 📝 Ejemplo Completo

Ver la carpeta `examples/` para un ejemplo completo y funcional.

## 🎨 Próximas Mejoras

- [ ] Soporte para eventos personalizados
- [ ] Validación de formularios
- [ ] Sistema de sesiones persistente
- [ ] Optimización de actualizaciones del DOM (diffing)
- [ ] Soporte para múltiples componentes en la misma página
- [ ] Script de instalación para copiar el runtime JS automáticamente

## 📄 Licencia

MIT

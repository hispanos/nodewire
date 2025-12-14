# Framework MVC con NodeWire

Framework web inspirado en Laravel, construido con Node.js y TypeScript, que incluye **NodeWire** - un sistema similar a Livewire para crear componentes interactivos sin escribir JavaScript del lado del cliente.

## 🚀 Características

- **Arquitectura MVC**: Patrón Modelo-Vista-Controlador
- **NodeWire**: Sistema de componentes reactivos similar a Livewire
- **Motor de plantillas EJS**: Para renderizar vistas
- **TypeScript**: Tipado estático para mayor seguridad
- **Express.js**: Servidor web robusto

## 📦 Instalación

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

## 🎯 NodeWire - Cómo Funciona

NodeWire permite crear componentes interactivos donde el estado se gestiona en el servidor y se sincroniza automáticamente con el cliente.

### Ejemplo: Componente Contador

```typescript
// src/app/Components/CounterComponent.ts
import { Component } from '../../nodewire/Component';

export class CounterComponent extends Component {
    public count: number = 0;

    constructor(initialValue: number = 0, id?: string) {
        super('CounterComponent', id);
        this.count = initialValue;
    }

    public increment(): void {
        this.count += 1;
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/counter', { component: this });
    }
}
```

### Vista del Componente

```ejs
<div 
    data-nodewire-id="<%= component.id %>"
    data-nodewire-state='<%= JSON.stringify(component.getState()) %>'
    data-nodewire-name="<%= component.name %>"
>
    <h1><%= component.count %></h1>
    <button data-nw-click="increment">+</button>
</div>
```

### Flujo de NodeWire

1. **Renderizado Inicial (SSR)**: El servidor renderiza el componente con su estado inicial
2. **Interacción del Cliente**: El usuario hace clic en un botón con `data-nw-click`
3. **AJAX Automático**: El runtime de NodeWire intercepta el evento y envía una petición al servidor
4. **Actualización del Servidor**: El servidor ejecuta el método, actualiza el estado y renderiza el componente
5. **Actualización del DOM**: El runtime recibe el HTML actualizado y lo parchea en el DOM

## 📁 Estructura del Proyecto

```
framework/
├── src/
│   ├── core/              # Núcleo del framework
│   │   ├── Application.ts # Clase principal de la aplicación
│   │   └── Router.ts      # Sistema de rutas
│   ├── nodewire/          # Sistema NodeWire
│   │   ├── Component.ts   # Clase base para componentes
│   │   └── NodeWireManager.ts # Gestor de componentes
│   ├── app/
│   │   └── Components/    # Componentes de la aplicación
│   └── index.ts          # Punto de entrada
├── resources/
│   └── views/             # Plantillas EJS
│       └── components/    # Componentes NodeWire
├── public/
│   └── js/
│       └── nodewire-runtime.js # Runtime JavaScript del cliente
└── package.json
```

## 🔧 Crear un Nuevo Componente NodeWire

1. **Crear la clase del componente**:

```typescript
// src/app/Components/MiComponente.ts
import { Component } from '../../nodewire/Component';

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

2. **Registrar el componente** en `src/index.ts`:

```typescript
import { MiComponente } from './app/Components/MiComponente';

nodeWireManager.registerComponent('MiComponente', MiComponente);
```

3. **Crear la vista** en `resources/views/components/mi-componente.ejs`

4. **Usar el componente** en una vista:

```typescript
const componente = nodeWireManager.createComponent('MiComponente');
res.render('mi-vista', { componente });
```

## 📝 Notas

- Las propiedades públicas del componente se sincronizan automáticamente con el cliente
- Los métodos públicos pueden ser invocados desde el cliente usando `data-nw-click="nombreMetodo"`
- El estado se serializa y deserializa automáticamente

## 🎨 Próximas Mejoras

- [ ] Soporte para eventos personalizados
- [ ] Validación de formularios
- [ ] Sistema de sesiones persistente
- [ ] Optimización de actualizaciones del DOM (diffing)
- [ ] Soporte para múltiples componentes en la misma página


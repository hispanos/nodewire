import { Component } from './Component';
import path from 'node:path';
import ejs from 'ejs';

type ComponentConstructor = new (...args: any[]) => Component;

export class NodeWireManager {
    private components: Map<string, Component> = new Map();
    private componentRegistry: Map<string, ComponentConstructor> = new Map();
    private viewsPath: string;

    constructor(viewsPath?: string) {
        this.viewsPath = viewsPath || path.join(process.cwd(), 'resources/views');
    }

    /**
     * Establece la ruta de las vistas
     */
    public setViewsPath(viewsPath: string): void {
        this.viewsPath = viewsPath;
    }

    /**
     * Registra un componente para que pueda ser instanciado
     */
    public registerComponent(name: string, componentClass: ComponentConstructor): void {
        this.componentRegistry.set(name, componentClass);
    }

    /**
     * Crea una nueva instancia de un componente
     */
    public createComponent(name: string, ...args: any[]): Component {
        const ComponentClass = this.componentRegistry.get(name);
        
        if (!ComponentClass) {
            throw new Error(`Componente ${name} no está registrado`);
        }

        const component = new ComponentClass(...args);
        this.components.set(component.id, component);
        
        return component;
    }

    /**
     * Obtiene un componente por su ID
     */
    public getComponent(id: string): Component | undefined {
        return this.components.get(id);
    }

    /**
     * Maneja una llamada desde el cliente
     */
    public async handleComponentCall(
        id: string,
        componentName: string,
        method: string,
        state: Record<string, any>,
        viewsPath?: string
    ): Promise<{ success: boolean; html?: string; error?: string; newState?: Record<string, any> }> {
        try {
            const effectiveViewsPath = viewsPath || this.viewsPath;
            
            // Buscar o recrear el componente
            let component = this.components.get(id);
            
            if (!component) {
                // Si no existe, intentar recrearlo desde el registro
                const ComponentClass = this.componentRegistry.get(componentName);
                if (!ComponentClass) {
                    throw new Error(`Componente ${componentName} no encontrado`);
                }
                // Crear nueva instancia con valores por defecto y luego restaurar el ID
                // Nota: Los componentes deben aceptar el ID como último parámetro opcional
                component = new ComponentClass();
                component.id = id; // Restaurar el ID original
                this.components.set(id, component);
            }

            // Restaurar el estado del componente
            component.setState(state);

            // Ejecutar el método solicitado
            if (typeof (component as any)[method] !== 'function') {
                throw new Error(`Método ${method} no existe en ${componentName}`);
            }

            await (component as any)[method]();

            // Renderizar el componente actualizado
            const html = component.render(this.getTemplateEngine(effectiveViewsPath));

            // Obtener el nuevo estado
            const newState = component.getState();

            return {
                success: true,
                html,
                newState
            };
        } catch (error: any) {
            console.error('Error en handleComponentCall:', error);
            return {
                success: false,
                error: error.message || 'Error desconocido'
            };
        }
    }

    /**
     * Renderiza un componente y devuelve su HTML
     */
    public renderComponent(component: Component): string {
        return component.render(this.getTemplateEngine());
    }

    /**
     * Obtiene el motor de plantillas EJS configurado
     */
    private getTemplateEngine(viewsPath?: string): any {
            const effectiveViewsPath = viewsPath || this.viewsPath;
            return {
                render: (template: string, data: any): string => {
                    // Sanitizar el nombre del template para evitar path traversal
                    // Permitir barras pero eliminar .. y rutas absolutas
                    let safeTemplate = template.replace(/\.\./g, '').replace(/^\/+/, '');
                    // Normalizar separadores de ruta
                    safeTemplate = safeTemplate.replace(/\\/g, '/');
                    const templatePath = path.join(effectiveViewsPath, `${safeTemplate}.ejs`);
                    const fs = require('node:fs');
                    const templateContent = fs.readFileSync(templatePath, 'utf8');
                    
                    // Agregar helpers para NodeWire
                    const helpers = {
                        nodewireState: (component: any) => {
                            return `<script type="application/json" data-nodewire-state="${component.id}" data-component-name="${component.name}">${JSON.stringify(component.getState())}</script>`;
                        },
                        nodewireId: (component: any) => {
                            return component.id;
                        },
                        nodewireComponent: (component: any) => {
                            return component.name;
                        }
                    };
                    
                    return ejs.render(templateContent, { ...data, ...helpers });
                }
            };
    }

    /**
     * Limpia componentes antiguos (útil para gestión de memoria)
     */
    public cleanup(): void {
        // En producción, podrías implementar un sistema de expiración
        // Por ahora, mantenemos todos los componentes en memoria
    }
}


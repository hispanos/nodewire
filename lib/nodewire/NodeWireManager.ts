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
    ): Promise<{ success: boolean; html?: string; error?: string; newState?: Record<string, any>; updates?: Record<string, any> }> {
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

            // Guardar el estado anterior para detectar cambios
            const oldState = JSON.parse(JSON.stringify(component.getState()));

            // Restaurar el estado del componente
            component.setState(state);

            // Ejecutar el método solicitado
            if (typeof (component as any)[method] !== 'function') {
                throw new Error(`Método ${method} no existe en ${componentName}`);
            }

            await (component as any)[method]();

            // Obtener el nuevo estado
            const newState = component.getState();

            // Detectar qué propiedades cambiaron (usando comparación profunda)
            const updates: Record<string, any> = {};
            for (const key in newState) {
                const oldValue = oldState[key];
                const newValue = newState[key];
                // Comparar usando JSON para manejar objetos y arrays
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    updates[key] = newValue;
                }
            }

            console.log('[NodeWire] Estado actualizado:', {
                oldState,
                newState,
                updates,
                componentId: id
            });

            // Renderizar el componente actualizado
            const html = component.render(this.getTemplateEngine(effectiveViewsPath));

            return {
                success: true,
                html,
                newState,
                updates // Propiedades que cambiaron
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
                    const component = data.component;
                    const helpers = {
                        nodewireState: (comp: any) => {
                            return `<script type="application/json" data-nodewire-state="${comp.id}" data-component-name="${comp.name}">${JSON.stringify(comp.getState())}</script>`;
                        },
                        nodewireId: (comp: any) => {
                            return comp.id;
                        },
                        nodewireComponent: (comp: any) => {
                            return comp.name;
                        },
                        // Helper para marcar automáticamente elementos con propiedades del componente
                        wire: (prop: string, content: any) => {
                            if (!component) {
                                console.warn('[NodeWire] wire() llamado sin componente disponible');
                                return String(content || '');
                            }
                            const contentStr = String(content || '');
                            const html = `<span data-nodewire-id="${component.id}" data-nodewire-prop="${prop}">${contentStr}</span>`;
                            console.log(`[NodeWire] wire() generado para prop "${prop}":`, html);
                            return html;
                        }
                    };
                    
                    let html = ejs.render(templateContent, { ...data, ...helpers });
                    
                    // Post-procesar el HTML para marcar automáticamente elementos que contienen component.propiedad
                    if (component) {
                        html = this.autoMarkComponentProperties(html, component);
                    }
                    
                    return html;
                }
            };
    }

    /**
     * Marca automáticamente los elementos que contienen propiedades del componente
     * Busca elementos que contengan valores del componente y los marca automáticamente
     */
    private autoMarkComponentProperties(html: string, component: Component): string {
        const state = component.getState();
        const componentId = component.id;
        
        // Usar una expresión regular para encontrar elementos que podrían contener propiedades
        // Esto es una aproximación - en la práctica, es mejor usar el helper wire() en las plantillas
        // Pero podemos intentar marcar elementos que contienen valores conocidos
        
        // Por ahora, retornamos el HTML sin modificar
        // El desarrollador debe usar el helper wire() o data-attributes manualmente
        // O podemos implementar un sistema más sofisticado de análisis de DOM
        
        return html;
    }

    /**
     * Limpia componentes antiguos (útil para gestión de memoria)
     */
    public cleanup(): void {
        // En producción, podrías implementar un sistema de expiración
        // Por ahora, mantenemos todos los componentes en memoria
    }
}

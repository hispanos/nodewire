import { Component } from './Component';
import path from 'node:path';
import { BladeEngine } from '../blade/BladeEngine';

type ComponentConstructor = new (...args: any[]) => Component;

export class NodeWireManager {
    private components: Map<string, Component> = new Map();
    private componentRegistry: Map<string, ComponentConstructor> = new Map();
    private componentInitialParams: Map<string, { name: string; args: any[]; options?: Record<string, any> }> = new Map();
    private viewsPath: string;
    private bladeEngine: BladeEngine | null = null;

    constructor(viewsPath?: string) {
        this.viewsPath = viewsPath || path.join(process.cwd(), 'resources/views');
    }

    /**
     * Establece el BladeEngine para renderizar componentes
     */
    public setBladeEngine(bladeEngine: BladeEngine): void {
        this.bladeEngine = bladeEngine;
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
     * Verifica si un componente está registrado
     */
    public isComponentRegistered(name: string): boolean {
        return this.componentRegistry.has(name);
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
        const componentId = component.id;
        this.components.set(componentId, component);
        
        // Guardar los parámetros de inicialización para poder recrear el componente
        this.componentInitialParams.set(componentId, {
            name: name,
            args: args
        });
        
        return component;
    }

    /**
     * Crea un componente con opciones nombradas
     * Las opciones se mapean a los parámetros del constructor
     */
    public createComponentWithOptions(name: string, options: Record<string, any>): Component {
        const ComponentClass = this.componentRegistry.get(name);
        
        if (!ComponentClass) {
            throw new Error(`Componente ${name} no está registrado`);
        }

        // Obtener los parámetros del constructor usando reflection
        const constructorParams = this.getConstructorParams(ComponentClass);
        
        // Mapear las opciones a los argumentos del constructor en el orden correcto
        const args = constructorParams.map((paramName: string) => {
            // Buscar la opción por nombre (case-insensitive y sin guiones)
            const normalizedParam = paramName.toLowerCase().replace(/[_-]/g, '');
            for (const [key, value] of Object.entries(options)) {
                const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
                if (normalizedKey === normalizedParam) {
                    console.log(`[NodeWire] Mapeando ${key} -> ${paramName} = ${value}`);
                    return value;
                }
            }
            // Si no se encuentra, retornar undefined (el constructor usará el valor por defecto)
            console.log(`[NodeWire] No se encontró opción para parámetro ${paramName}, usando undefined (valor por defecto)`);
            return undefined;
        });
        
        // Debug: verificar que los parámetros se mapearon correctamente
        console.log(`[NodeWire] ===== Creando componente ${name} =====`);
        console.log(`[NodeWire] Opciones recibidas:`, JSON.stringify(options));
        console.log(`[NodeWire] Parámetros del constructor detectados:`, constructorParams);
        console.log(`[NodeWire] Argumentos finales que se pasarán al constructor:`, args);
        console.log(`[NodeWire] ==========================================`);

        const component = new ComponentClass(...args);
        const componentId = component.id;
        this.components.set(componentId, component);
        
        // Verificar el estado del componente después de crearlo
        console.log(`[NodeWire] Componente creado con ID: ${componentId}`);
        if ('count' in component) {
            console.log(`[NodeWire] Estado del componente (count): ${(component as any).count}`);
        }
        
        // Guardar los parámetros de inicialización para poder recrear el componente
        this.componentInitialParams.set(componentId, {
            name: name,
            args: args,
            options: options
        });
        
        return component;
    }

    /**
     * Obtiene los nombres de los parámetros del constructor usando reflection
     * Nota: Esto requiere que el código no esté minificado
     */
    private getConstructorParams(ComponentClass: ComponentConstructor): string[] {
        try {
            const constructorString = ComponentClass.toString();
            const match = constructorString.match(/constructor\s*\(([^)]*)\)/);
            if (match && match[1]) {
                return match[1]
                    .split(',')
                    .map(param => {
                        // Remover valores por defecto (ej: "initialValue = 0" -> "initialValue")
                        const cleaned = param.trim().split('=')[0].trim();
                        // Remover tipos TypeScript (ej: "initialValue: number" -> "initialValue")
                        return cleaned.split(':')[0].trim();
                    })
                    .filter(param => param.length > 0);
            }
        } catch (e) {
            // Si falla, retornar array vacío
        }
        return [];
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
                // Si no existe, intentar recrearlo desde el registro con los parámetros guardados
                const initialParams = this.componentInitialParams.get(id);
                
                if (initialParams) {
                    // Recrear con los parámetros originales
                    const ComponentClass = this.componentRegistry.get(initialParams.name);
                    if (!ComponentClass) {
                        throw new Error(`Componente ${initialParams.name} no encontrado`);
                    }
                    
                    // Guardar el ID original que necesitamos restaurar
                    const originalId = id;
                    
                    // Si tiene opciones guardadas, recrear manualmente para controlar el ID
                    if (initialParams.options) {
                        const constructorParams = this.getConstructorParams(ComponentClass);
                        const args = constructorParams.map((paramName: string) => {
                            const normalizedParam = paramName.toLowerCase().replace(/[_-]/g, '');
                            for (const [key, value] of Object.entries(initialParams.options!)) {
                                const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
                                if (normalizedKey === normalizedParam) {
                                    return value;
                                }
                            }
                            return undefined;
                        });
                        component = new ComponentClass(...args);
                    } else {
                        // Usar los argumentos guardados
                        component = new ComponentClass(...initialParams.args);
                    }
                    
                    // Restaurar el ID original (importante para mantener la referencia del cliente)
                    const newId = component.id;
                    component.id = originalId;
                    
                    // Actualizar el Map: remover el nuevo ID y usar el original
                    this.components.delete(newId);
                    this.components.set(originalId, component);
                    
                    // Actualizar también los parámetros iniciales con el ID correcto
                    this.componentInitialParams.delete(newId);
                    this.componentInitialParams.set(originalId, initialParams);
                } else {
                    // Fallback: crear con valores por defecto si no hay parámetros guardados
                    const ComponentClass = this.componentRegistry.get(componentName);
                    if (!ComponentClass) {
                        throw new Error(`Componente ${componentName} no encontrado`);
                    }
                    component = new ComponentClass();
                    component.id = id;
                    this.components.set(id, component);
                }
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
     * Obtiene el motor de plantillas Blade configurado
     */
    public getTemplateEngine(viewsPath?: string): any {
        const effectiveViewsPath = viewsPath || this.viewsPath;
        
        // Si no hay BladeEngine configurado, crear uno temporal
        let engine = this.bladeEngine;
        if (!engine) {
            engine = new BladeEngine({
                viewsPath: effectiveViewsPath,
                cacheEnabled: false
            });
        }
        
        return {
            render: (template: string, data: any): string => {
                // Sanitizar el nombre del template para evitar path traversal
                let safeTemplate = template.replace(/\.\./g, '').replace(/^\/+/, '');
                safeTemplate = safeTemplate.replace(/\\/g, '/');
                
                // Renderizar con BladeEngine
                let html = engine!.render(safeTemplate, data);
                
                // Post-procesar el HTML para marcar automáticamente elementos que contienen component.propiedad
                const component = data.component;
                if (component) {
                    const htmlBefore = html;
                    html = this.autoMarkComponentProperties(html, component);
                    if (htmlBefore !== html) {
                        console.log('[NodeWire] HTML marcado automáticamente. Cambios detectados.');
                    } else {
                        console.log('[NodeWire] No se detectaron cambios en el HTML después del auto-marcado.');
                    }
                }
                
                // Asegurar que siempre devolvamos un string
                return typeof html === 'string' ? html : String(html || '');
            }
        };
    }

    /**
     * Marca automáticamente los elementos que contienen propiedades del componente
     * Busca elementos que contengan valores del componente y los marca automáticamente
     */
    public autoMarkComponentProperties(html: string, component: Component): string {
        const state = component.getState();
        const componentId = component.id;
        let markedCount = 0;
        
        console.log('[NodeWire] Auto-marcando propiedades. Estado:', state, 'ComponentId:', componentId);
        
        // Para cada propiedad del estado, buscar elementos que contengan ese valor
        for (const [propName, propValue] of Object.entries(state)) {
            // Convertir el valor a string para buscar en el HTML
            const valueStr = String(propValue);
            
            console.log(`[NodeWire] Buscando elementos con valor "${valueStr}" para propiedad "${propName}"`);
            
            // Buscar elementos que contengan este valor exacto como contenido de texto
            // Patrón mejorado: encontrar elementos HTML completos que contengan el valor
            // Ejemplo: <div style="...">0</div> donde 0 es el valor de count
            
            // Primero, buscar elementos que contengan el valor exacto (sin espacios extra)
            const exactValueRegex = new RegExp(
                `(<([a-zA-Z][a-zA-Z0-9]*)(?![^>]*data-nodewire-prop)[^>]*>)\\s*${this.escapeRegex(valueStr)}\\s*(</\\2>)`,
                'gi'
            );
            
            html = html.replace(exactValueRegex, (match, openTag, tagName, closeTag) => {
                // Verificar que el elemento no esté ya marcado
                if (openTag.includes('data-nodewire-prop')) {
                    return match;
                }
                
                console.log(`[NodeWire] ✅ Marcando elemento exacto: ${tagName} con valor "${valueStr}"`);
                markedCount++;
                
                // Agregar los atributos de NodeWire al tag de apertura
                // Insertar antes del cierre del tag (>)
                const newOpenTag = openTag.replace(
                    />$/,
                    ` data-nodewire-id="${componentId}" data-nodewire-prop="${propName}">`
                );
                
                return `${newOpenTag}${valueStr}${closeTag}`;
            });
            
            // También buscar elementos que contengan el valor pero con posible contenido adicional
            // Esto maneja casos como <div>Count: 0</div>
            const containsValueRegex = new RegExp(
                `(<([a-zA-Z][a-zA-Z0-9]*)(?![^>]*data-nodewire-prop)[^>]*>)([^<]*${this.escapeRegex(valueStr)}[^<]*)(</\\2>)`,
                'gi'
            );
            
            html = html.replace(containsValueRegex, (match, openTag, tagName, content, closeTag) => {
                // Verificar que el elemento no esté ya marcado (doble verificación)
                if (openTag.includes('data-nodewire-prop')) {
                    return match;
                }
                
                // Solo marcar si el contenido contiene principalmente el valor
                const trimmedContent = content.trim();
                if (trimmedContent === valueStr || trimmedContent.endsWith(valueStr) || trimmedContent.startsWith(valueStr)) {
                    console.log(`[NodeWire] ✅ Marcando elemento con contenido: ${tagName} con valor "${valueStr}"`);
                    markedCount++;
                    
                    // Agregar los atributos de NodeWire
                    const newOpenTag = openTag.replace(
                        />$/,
                        ` data-nodewire-id="${componentId}" data-nodewire-prop="${propName}">`
                    );
                    
                    return `${newOpenTag}${content}${closeTag}`;
                }
                
                return match;
            });
        }
        
        // También marcar elementos con data-nw-event-{eventType} que estén dentro del componente
        // Buscar el script de estado del componente usando regex
        const stateScriptRegex = new RegExp(
            `<script[^>]*data-nodewire-state="${this.escapeRegex(componentId)}"[^>]*>`,
            'i'
        );
        const stateScriptMatch = stateScriptRegex.exec(html);
        
        if (stateScriptMatch) {
            const stateScriptIndex = stateScriptMatch.index;
            
            // Buscar el cierre del script de estado
            const scriptCloseIndex = html.indexOf('</script>', stateScriptIndex);
            if (scriptCloseIndex !== -1) {
                // Buscar el siguiente script de estado (de otro componente) o el final del HTML
                const nextStateScriptRegex = /<script[^>]*data-nodewire-state="[^"]*"[^>]*>/gi;
                nextStateScriptRegex.lastIndex = scriptCloseIndex + 9;
                const nextMatch = nextStateScriptRegex.exec(html);
                const sectionEnd = nextMatch ? nextMatch.index : html.length;
                
                // Extraer la sección del componente (desde después del script hasta el siguiente script o final)
                const componentSection = html.substring(scriptCloseIndex + 9, sectionEnd);
                
                // Buscar elementos con data-nw-event-{eventType} que no tengan data-nodewire-id
                // Buscar cualquier elemento HTML con atributos data-nw-event-* (puede tener múltiples)
                // El regex busca elementos que tengan al menos un atributo data-nw-event- seguido de cualquier carácter válido
                const eventElementRegex = /(<[a-zA-Z][^>]*data-nw-event-[a-zA-Z0-9-]+[^>]*)(?![^>]*data-nodewire-id)([^>]*>)/gi;
                const buttonMatches: Array<{match: string, index: number}> = [];
                
                let match;
                while ((match = eventElementRegex.exec(componentSection)) !== null) {
                    buttonMatches.push({
                        match: match[0],
                        index: scriptCloseIndex + 9 + match.index
                    });
                }
                
                // Reemplazar los elementos de atrás hacia adelante para mantener los índices correctos
                for (let i = buttonMatches.length - 1; i >= 0; i--) {
                    const elementMatch = buttonMatches[i];
                    const newElement = elementMatch.match.replace(
                        />/,
                        ` data-nodewire-id="${componentId}" data-nodewire-component="${component.name}">`
                    );
                    
                    html = html.substring(0, elementMatch.index) + 
                           newElement + 
                           html.substring(elementMatch.index + elementMatch.match.length);
                    
                    console.log(`[NodeWire] ✅ Marcando elemento con data-nw-event para componente ${component.name}`);
                    markedCount++;
                }
            }
        }
        
        console.log(`[NodeWire] Total de elementos marcados: ${markedCount}`);
        
        return html;
    }
    
    /**
     * Escapa caracteres especiales para usar en expresiones regulares
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Limpia componentes antiguos (útil para gestión de memoria)
     */
    public cleanup(): void {
        // En producción, podrías implementar un sistema de expiración
        // Por ahora, mantenemos todos los componentes en memoria
    }
}

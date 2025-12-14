/**
 * NodeWire Runtime - Cliente JavaScript
 * Similar a Livewire.js, intercepta eventos y sincroniza con el servidor
 */
class NodeWireRuntime {
    constructor() {
        this.endpoint = '/nodewire/call';
        this.init();
    }

    init() {
        // Interceptar eventos de click
        document.addEventListener('click', this.handleClick.bind(this));
    }

    /**
     * Maneja los eventos de click en elementos con data-nw-click
     */
    handleClick(e) {
        const target = e.target;
        const method = target.getAttribute('data-nw-click');
        
        if (!method) return;

        e.preventDefault();
        e.stopPropagation();

        // Buscar el componente automáticamente desde el botón
        // Buscar en el botón, luego en elementos padres, luego en el documento
        let componentId = target.getAttribute('data-nodewire-id');
        let componentName = target.getAttribute('data-nodewire-component');
        
        // Si no está en el botón, buscar en un elemento padre cercano
        if (!componentId) {
            let parent = target.parentElement;
            let depth = 0;
            while (parent && depth < 5) { // Buscar hasta 5 niveles arriba
                componentId = parent.getAttribute('data-nodewire-id');
                if (componentId) {
                    componentName = parent.getAttribute('data-nodewire-component') || componentName;
                    break;
                }
                parent = parent.parentElement;
                depth++;
            }
        }

        // Si aún no encontramos el ID, buscar el script de estado más cercano
        if (!componentId) {
            const stateScript = target.closest('[data-nodewire-state], script[data-nodewire-state]') || 
                               document.querySelector(`script[data-nodewire-state]`);
            if (stateScript) {
                componentId = stateScript.getAttribute('data-nodewire-state');
                componentName = stateScript.getAttribute('data-component-name') || componentName;
            }
        }

        if (!componentId) {
            console.warn('[NodeWire] No se encontró el ID del componente');
            return;
        }

        // Buscar el estado del componente desde el script oculto
        const stateElement = document.querySelector(`script[data-nodewire-state="${componentId}"]`);
        let currentState = {};
        
        if (stateElement) {
            try {
                currentState = JSON.parse(stateElement.textContent || '{}');
                if (!componentName) {
                    componentName = stateElement.getAttribute('data-component-name');
                }
            } catch (e) {
                console.warn('[NodeWire] Error parseando el estado:', e);
            }
        }

        if (!componentName) {
            console.warn('[NodeWire] No se encontró el nombre del componente');
            return;
        }

        this.callBackend(componentId, componentName, method, currentState);
    }

    /**
     * Realiza la petición AJAX al servidor
     */
    async callBackend(id, name, method, state) {
        try {
            // Mostrar indicador de carga en todos los elementos del componente
            this.showLoading(id);

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    id: id,
                    component: name,
                    method: method,
                    state: state
                })
            });

            const result = await response.json();

            console.log('[NodeWire] Respuesta del servidor:', result);

            if (result.success) {
                // Actualizar elementos basándose en las propiedades que cambiaron
                this.updateElements(id, result.html, result.newState, result.updates);
            } else {
                console.error('[NodeWire] Error:', result.error);
                this.showError(id, result.error);
            }
        } catch (error) {
            console.error('[NodeWire] Error de red:', error);
            this.showError(id, 'Error de conexión con el servidor');
        } finally {
            this.hideLoading(id);
        }
    }

    /**
     * Actualiza elementos basándose en las propiedades que cambiaron
     */
    updateElements(componentId, newHTML, newState, updates) {
        console.log('[NodeWire] Actualizando elementos:', { componentId, updates, newState, htmlLength: newHTML.length });
        
        // Crear un elemento temporal para parsear el nuevo HTML
        const temp = document.createElement('div');
        temp.innerHTML = newHTML;

        // Si hay actualizaciones específicas, actualizar solo esas propiedades
        if (updates && Object.keys(updates).length > 0) {
            console.log('[NodeWire] Actualizando propiedades específicas:', updates);
            
            // Buscar elementos en el DOM actual
            const currentElements = document.querySelectorAll(`[data-nodewire-id="${componentId}"][data-nodewire-prop]`);
            console.log(`[NodeWire] Elementos actuales encontrados en DOM:`, currentElements.length);
            
            // Actualizar elementos marcados con data-nodewire-prop
            for (const prop in updates) {
                const selector = `[data-nodewire-id="${componentId}"][data-nodewire-prop="${prop}"]`;
                const newElements = temp.querySelectorAll(selector);
                const currentElementsForProp = document.querySelectorAll(selector);
                
                console.log(`[NodeWire] Propiedad "${prop}":`, {
                    nuevos: newElements.length,
                    actuales: currentElementsForProp.length,
                    selector,
                    nuevoHTML: newElements.length > 0 ? newElements[0].outerHTML : 'N/A',
                    actualHTML: currentElementsForProp.length > 0 ? currentElementsForProp[0].outerHTML : 'N/A'
                });
                
                if (currentElementsForProp.length === 0) {
                    console.warn(`[NodeWire] No se encontraron elementos actuales para la propiedad "${prop}"`);
                    // Intentar buscar sin el atributo data-nodewire-prop
                    const fallbackSelector = `[data-nodewire-id="${componentId}"]`;
                    const fallbackElements = document.querySelectorAll(fallbackSelector);
                    console.log(`[NodeWire] Elementos con fallback:`, fallbackElements.length);
                }
                
                currentElementsForProp.forEach((currentEl, index) => {
                    const newEl = newElements[index];
                    if (newEl) {
                        const oldContent = currentEl.innerHTML;
                        const newContent = newEl.innerHTML;
                        console.log(`[NodeWire] Actualizando elemento ${index}:`, {
                            actual: oldContent,
                            nuevo: newContent,
                            cambiara: oldContent !== newContent
                        });
                        currentEl.innerHTML = newContent;
                    } else {
                        console.warn(`[NodeWire] No se encontró elemento nuevo para índice ${index}`);
                    }
                });
            }
        } else {
            console.log('[NodeWire] No hay actualizaciones específicas, usando fallback');
            // Fallback: actualizar todos los elementos con el ID del componente
            const selector = `[data-nodewire-id="${componentId}"]`;
            const newElements = temp.querySelectorAll(selector);
            const currentElements = document.querySelectorAll(selector);

            console.log(`[NodeWire] Fallback - Elementos encontrados:`, {
                nuevos: newElements.length,
                actuales: currentElements.length,
                selector
            });

            currentElements.forEach((currentEl, index) => {
                const newEl = newElements[index];
                if (newEl) {
                    console.log(`[NodeWire] Actualizando elemento ${index} (fallback):`, {
                        actual: currentEl.innerHTML,
                        nuevo: newEl.innerHTML
                    });
                    currentEl.innerHTML = newEl.innerHTML;
                    Array.from(newEl.attributes).forEach(attr => {
                        if (attr.name !== 'data-nodewire-id') {
                            currentEl.setAttribute(attr.name, attr.value);
                        }
                    });
                } else {
                    console.warn(`[NodeWire] No se encontró elemento nuevo para índice ${index} (fallback)`);
                }
            });
        }

        // Actualizar el elemento de estado
        const stateElement = document.querySelector(`script[data-nodewire-state="${componentId}"]`);
        if (stateElement) {
            stateElement.textContent = JSON.stringify(newState || {});
        }

        // Disparar evento personalizado
        document.dispatchEvent(new CustomEvent('nodewire:updated', {
            detail: { componentId, newState, updates }
        }));
    }

    /**
     * Muestra un indicador de carga en todos los elementos del componente
     */
    showLoading(componentId) {
        const elements = document.querySelectorAll(`[data-nodewire-id="${componentId}"]`);
        elements.forEach(el => {
            el.style.opacity = '0.6';
            el.style.pointerEvents = 'none';
        });
    }

    /**
     * Oculta el indicador de carga
     */
    hideLoading(componentId) {
        const elements = document.querySelectorAll(`[data-nodewire-id="${componentId}"]`);
        elements.forEach(el => {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        });
    }

    /**
     * Muestra un error
     */
    showError(componentId, message) {
        console.error('[NodeWire]', message);
    }
}

// Inicializar NodeWire cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.NodeWire = new NodeWireRuntime();
    });
} else {
    window.NodeWire = new NodeWireRuntime();
}

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

        // Obtener el ID del componente desde el botón o buscar el más cercano
        let componentId = target.getAttribute('data-nodewire-id');
        let componentName = target.getAttribute('data-nodewire-component');
        
        // Si no está en el botón, buscar en un elemento padre
        if (!componentId) {
            const parentWithId = target.closest('[data-nodewire-id]');
            if (parentWithId) {
                componentId = parentWithId.getAttribute('data-nodewire-id');
                componentName = parentWithId.getAttribute('data-nodewire-component') || componentName;
            }
        }

        if (!componentId) {
            console.warn('[NodeWire] No se encontró el ID del componente');
            return;
        }

        // Buscar el estado del componente desde un elemento oculto o desde el mismo elemento
        const stateElement = document.querySelector(`[data-nodewire-state="${componentId}"]`);
        let currentState = {};
        
        if (stateElement) {
            try {
                currentState = JSON.parse(stateElement.textContent || stateElement.getAttribute('data-state') || '{}');
            } catch (e) {
                console.warn('[NodeWire] Error parseando el estado:', e);
            }
        }

        // Si no hay nombre del componente, intentar obtenerlo del estado
        if (!componentName) {
            componentName = stateElement?.getAttribute('data-component-name');
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

            if (result.success) {
                // Actualizar solo los elementos con el data-nodewire-id correspondiente
                this.updateElements(id, result.html, result.newState);
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
     * Actualiza solo los elementos con el data-nodewire-id especificado
     */
    updateElements(componentId, newHTML, newState) {
        // Crear un elemento temporal para parsear el nuevo HTML
        const temp = document.createElement('div');
        temp.innerHTML = newHTML;

        // Buscar todos los elementos con el ID del componente en el nuevo HTML
        const newElements = temp.querySelectorAll(`[data-nodewire-id="${componentId}"]`);
        
        // Buscar todos los elementos actuales con ese ID
        const currentElements = document.querySelectorAll(`[data-nodewire-id="${componentId}"]`);

        // Actualizar cada elemento actual con su correspondiente del nuevo HTML
        currentElements.forEach((currentEl, index) => {
            const newEl = newElements[index];
            if (newEl) {
                // Actualizar el contenido del elemento
                currentEl.innerHTML = newEl.innerHTML;
                
                // Copiar atributos relevantes (excepto data-nodewire-id)
                Array.from(newEl.attributes).forEach(attr => {
                    if (attr.name !== 'data-nodewire-id') {
                        currentEl.setAttribute(attr.name, attr.value);
                    }
                });
            }
        });

        // Actualizar el elemento de estado si existe
        const stateElement = document.querySelector(`[data-nodewire-state="${componentId}"]`);
        if (stateElement) {
            stateElement.textContent = JSON.stringify(newState || {});
        }

        // Disparar evento personalizado para notificar la actualización
        document.dispatchEvent(new CustomEvent('nodewire:updated', {
            detail: { componentId, newState }
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
        // Puedes implementar una notificación de error aquí
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

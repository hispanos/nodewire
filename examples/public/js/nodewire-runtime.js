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
        
        // Interceptar otros eventos comunes si es necesario
        // document.addEventListener('submit', this.handleSubmit.bind(this));
        // document.addEventListener('change', this.handleChange.bind(this));
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

        const componentRoot = target.closest('[data-nodewire-id]');
        if (!componentRoot) {
            console.warn('[NodeWire] No se encontró el componente raíz');
            return;
        }

        const componentId = componentRoot.getAttribute('data-nodewire-id');
        const componentName = componentRoot.getAttribute('data-nodewire-name');
        const currentState = JSON.parse(componentRoot.getAttribute('data-nodewire-state') || '{}');

        this.callBackend(componentId, componentName, method, currentState, componentRoot);
    }

    /**
     * Realiza la petición AJAX al servidor
     */
    async callBackend(id, name, method, state, rootElement) {
        try {
            // Mostrar indicador de carga (opcional)
            this.showLoading(rootElement);

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
                // Actualizar el DOM con el nuevo HTML
                this.updateDOM(rootElement, result.html, result.newState);
            } else {
                console.error('[NodeWire] Error:', result.error);
                this.showError(rootElement, result.error);
            }
        } catch (error) {
            console.error('[NodeWire] Error de red:', error);
            this.showError(rootElement, 'Error de conexión con el servidor');
        } finally {
            this.hideLoading(rootElement);
        }
    }

    /**
     * Actualiza el DOM con el nuevo HTML renderizado
     * Estrategia: Reemplazar el contenido interno del componente manteniendo el elemento raíz
     */
    updateDOM(rootElement, newHTML, newState) {
        // Crear un elemento temporal para parsear el nuevo HTML
        const temp = document.createElement('div');
        temp.innerHTML = newHTML;

        // Obtener el nuevo elemento raíz del HTML renderizado
        const newRoot = temp.querySelector('[data-nodewire-id]');
        
        if (!newRoot) {
            console.warn('[NodeWire] El HTML renderizado no contiene un elemento raíz válido');
            return;
        }

        // Actualizar el estado en el atributo data-nodewire-state
        rootElement.setAttribute('data-nodewire-state', JSON.stringify(newState || {}));

        // Guardar el ID y nombre del componente (por si cambian)
        const newId = newRoot.getAttribute('data-nodewire-id');
        const newName = newRoot.getAttribute('data-nodewire-name');
        
        if (newId) rootElement.setAttribute('data-nodewire-id', newId);
        if (newName) rootElement.setAttribute('data-nodewire-name', newName);

        // Reemplazar el contenido interno del componente
        // Esto preserva el elemento raíz pero actualiza todo su contenido
        rootElement.innerHTML = newRoot.innerHTML;

        // Disparar evento personalizado para notificar la actualización
        rootElement.dispatchEvent(new CustomEvent('nodewire:updated', {
            detail: { newState }
        }));
    }

    /**
     * Muestra un indicador de carga (opcional)
     */
    showLoading(element) {
        element.style.opacity = '0.6';
        element.style.pointerEvents = 'none';
    }

    /**
     * Oculta el indicador de carga
     */
    hideLoading(element) {
        element.style.opacity = '1';
        element.style.pointerEvents = 'auto';
    }

    /**
     * Muestra un error (opcional)
     */
    showError(element, message) {
        // Puedes implementar una notificación de error aquí
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


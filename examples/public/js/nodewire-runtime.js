/**
 * NodeWire Runtime - Cliente JavaScript
 * Similar a Livewire.js, intercepta eventos y sincroniza con el servidor
 * Usa WebSockets para comunicación eficiente
 */
class NodeWireRuntime {
    constructor() {
        this.endpoint = '/nodewire/call';
        this.wsEndpoint = this.getWebSocketUrl();
        this.ws = null;
        this.wsConnected = false;
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.init();
    }

    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/nodewire/ws`;
    }

    init() {
        // Intentar conectar por WebSocket
        this.connectWebSocket();
        
        // Lista de eventos HTML estándar a escuchar
        const events = [
            // Mouse events
            'click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 
            'mousemove', 'mouseenter', 'mouseleave', 'contextmenu',
            // Keyboard events
            'keydown', 'keyup', 'keypress',
            // Form events
            'submit', 'change', 'input', 'focus', 'blur', 'select',
            // Drag events
            'drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop',
            // Touch events
            'touchstart', 'touchend', 'touchmove', 'touchcancel',
            // Media events
            'play', 'pause', 'ended', 'load', 'error',
            // Window events
            'resize', 'scroll',
            // Other common events
            'wheel', 'copy', 'cut', 'paste'
        ];
        
        // Interceptar todos los eventos usando delegación de eventos
        events.forEach(eventType => {
            document.addEventListener(eventType, this.handleEvent.bind(this), true);
        });
    }

    /**
     * Conecta al servidor WebSocket
     */
    connectWebSocket() {
        try {
            this.ws = new WebSocket(this.wsEndpoint);

            this.ws.onopen = () => {
                console.log('[NodeWire] WebSocket conectado');
                this.wsConnected = true;
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const result = JSON.parse(event.data);
                    this.handleWebSocketMessage(result);
                } catch (error) {
                    console.error('[NodeWire] Error parseando mensaje WebSocket:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[NodeWire] Error en WebSocket:', error);
                this.wsConnected = false;
            };

            this.ws.onclose = () => {
                console.log('[NodeWire] WebSocket desconectado');
                this.wsConnected = false;
                this.attemptReconnect();
            };
        } catch (error) {
            console.warn('[NodeWire] No se pudo conectar por WebSocket, usando HTTP fallback:', error);
            this.wsConnected = false;
        }
    }

    /**
     * Intenta reconectar el WebSocket
     */
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            console.log(`[NodeWire] Reintentando conexión en ${delay}ms (intento ${this.reconnectAttempts})`);
            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            console.warn('[NodeWire] Máximo de intentos de reconexión alcanzado, usando HTTP fallback');
        }
    }

    /**
     * Maneja mensajes recibidos por WebSocket
     */
    handleWebSocketMessage(result) {
        if (result.requestId) {
            const pendingRequest = this.pendingRequests.get(result.requestId);
            if (pendingRequest) {
                pendingRequest.resolve(result);
                this.pendingRequests.delete(result.requestId);
            }
        }
    }

    /**
     * Maneja todos los eventos en elementos con data-nw-event-{eventType}
     */
    handleEvent(e) {
        const target = e.target;
        const eventType = e.type;
        
        // Buscar el atributo data-nw-event-{eventType} para este tipo de evento específico
        const handler = target.getAttribute(`data-nw-event-${eventType}`);
        
        // Si no tiene el atributo para este evento, no es un evento NodeWire
        if (!handler) return;

        // Parsear método y argumentos: ej. "increment" o "increment(5, 'foo')"
        let method = handler.trim();
        let args = [];
        const callMatch = handler.match(/^([a-zA-Z0-9_]+)\s*\((.*)\)$/);
        if (callMatch) {
            method = callMatch[1];
            const argsText = callMatch[2].trim();
            if (argsText.length > 0) {
                try {
                    // Usar Function para evaluar argumentos como literals JS
                    args = Function(`"use strict";return [${argsText}];`)();
                } catch (err) {
                    console.warn('[NodeWire] No se pudieron parsear los argumentos del evento:', handler, err);
                    args = [];
                }
            }
        }

        e.preventDefault();
        e.stopPropagation();

        // Buscar el componente automáticamente desde el botón
        let componentId = target.getAttribute('data-nodewire-id');
        let componentName = target.getAttribute('data-nodewire-component');
        
        // Si no está en el botón, buscar en un elemento padre cercano
        if (!componentId) {
            let parent = target.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
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

        this.callBackend(componentId, componentName, method, args, currentState);
    }

    /**
     * Realiza la petición al servidor (WebSocket o HTTP fallback)
     */
    async callBackend(id, name, method, args, state) {
        try {
            // No mostrar indicador de carga global - las propiedades reactivas ($) manejan su propio loading

            if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Usar WebSocket
                const requestId = `req_${Date.now()}_${++this.requestIdCounter}`;
                const message = {
                    id,
                    component: name,
                    method,
                    args,
                    state,
                    requestId
                };

                // Crear promesa para la respuesta
                const promise = new Promise((resolve, reject) => {
                    this.pendingRequests.set(requestId, { resolve, reject });
                    
                    // Timeout después de 10 segundos
                    setTimeout(() => {
                        if (this.pendingRequests.has(requestId)) {
                            this.pendingRequests.delete(requestId);
                            reject(new Error('Timeout esperando respuesta'));
                        }
                    }, 10000);
                });

                this.ws.send(JSON.stringify(message));
                
                const result = await promise;
                
                if (result.success) {
                    this.updateElements(id, result.html, result.newState, result.updates);
                } else {
                    console.error('[NodeWire] Error:', result.error);
                    this.showError(id, result.error);
                }
            } else {
                // Fallback a HTTP
                console.log('[NodeWire] Usando HTTP fallback');
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
                        args: args,
                        state: state
                    })
                });

                const result = await response.json();

                if (result.success) {
                    this.updateElements(id, result.html, result.newState, result.updates);
                } else {
                    console.error('[NodeWire] Error:', result.error);
                    this.showError(id, result.error);
                }
            }
        } catch (error) {
            console.error('[NodeWire] Error de red:', error);
            this.showError(id, error?.message || 'Error de conexión con el servidor');
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

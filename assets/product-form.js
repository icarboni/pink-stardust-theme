if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();
        
        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cartNotification = document.querySelector('cart-notification');
        this.cartDrawer = document.querySelector('cart-drawer');
        this.cart = this.cartNotification || this.cartDrawer;
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cartNotification || this.cartDrawer) {
          let sectionsToRequest = [];
          
          // Get section IDs from both cart components if they exist
          if (this.cartNotification && this.cartDrawer) {
            // When both exist, we need sections from both
            const notificationSections = this.cartNotification.getSectionIdsToRequest ? 
              this.cartNotification.getSectionIdsToRequest() : 
              this.cartNotification.getSectionsToRender().map(section => section.id);
            const drawerSections = this.cartDrawer.getSectionsToRender().map(section => section.id);
            
            // Combine and deduplicate sections
            sectionsToRequest = [...new Set([...notificationSections, ...drawerSections])];
          } else if (this.cartNotification) {
            // Only notification exists
            sectionsToRequest = this.cartNotification.getSectionIdsToRequest ? 
              this.cartNotification.getSectionIdsToRequest() : 
              this.cartNotification.getSectionsToRender().map(section => section.id);
          } else if (this.cartDrawer) {
            // Only drawer exists
            sectionsToRequest = this.cartDrawer.getSectionsToRender().map(section => section.id);
          }
          
          if (sectionsToRequest.length > 0) {
            formData.append('sections', sectionsToRequest);
            formData.append('sections_url', window.location.pathname);
          }
          
          // Set active element on the primary cart component
          const primaryCart = this.cartNotification || this.cartDrawer;
          if (primaryCart && primaryCart.setActiveElement) {
            primaryCart.setActiveElement(document.activeElement);
          }
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cartNotification && !this.cartDrawer) {
              window.location = window.routes.cart_url;
              return;
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      // Always try to update cart notification for user feedback
                      if (this.cartNotification) {
                        this.cartNotification.renderContents(response);
                      }
                      
                      // Update cart drawer - if notification exists, update silently; otherwise show it
                      if (this.cartDrawer) {
                        if (this.cartNotification) {
                          this.cartDrawer.updateContents(response);
                        } else {
                          this.cartDrawer.renderContents(response);
                        }
                      }
                      
                      // If neither exists, fallback to standard cart behavior
                      if (!this.cartNotification && !this.cartDrawer && this.cart) {
                        this.cart.renderContents(response);
                      }
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                // Always try to update cart notification for user feedback
                if (this.cartNotification) {
                  this.cartNotification.renderContents(response);
                }
                // Update cart drawer - if notification exists, update silently; otherwise show it
                if (this.cartDrawer) {
                  if (this.cartNotification) {
                    this.cartDrawer.updateContents(response);
                  } else {
                    this.cartDrawer.renderContents(response);
                  }
                }
                // If neither exists, fallback to standard cart behavior
                if (!this.cartNotification && !this.cartDrawer && this.cart) {
                  this.cart.renderContents(response);
                }
              });
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}

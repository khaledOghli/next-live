/**
 * The store, as snippets see it.
 *
 * A thin re-export rather than the store itself: this directory *is* the SDK
 * surface, so what lives here is a deliberate contract with snippet authors,
 * and the real implementation stays free to move.
 */
export { useCart, addItem, clearCart, removeLastItem, getCartCount } from '@/lib/store';

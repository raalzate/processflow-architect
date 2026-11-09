import { useCallback, type Ref } from "react";

// Reserva espacio bajo los desplegables para dejar visible la barra inferior.
export const dropdownViewportPadding = { top: 12, right: 12, bottom: 88, left: 12 };

export function useDropdownViewportRef(ref: Ref<HTMLDivElement>) {
  return useCallback((content: HTMLDivElement | null) => {
    if (!content) return;
    const releaseRef = typeof ref === "function" ? ref(content) : undefined;
    if (ref && typeof ref !== "function") ref.current = content;

    const clearRef = () => {
      if (typeof releaseRef === "function") releaseRef();
      else if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };

    const wrapper = content.parentElement;
    if (!wrapper?.hasAttribute("data-radix-popper-content-wrapper")) return clearRef;

    // Radix limita el alto, pero una apertura hacia arriba sigue pegada al
    // disparador incluso cuando este queda dentro del margen inferior.
    const keepAboveBottom = () => {
      const limit = document.documentElement.clientHeight - dropdownViewportPadding.bottom;
      const lift = Math.max(0, wrapper.getBoundingClientRect().bottom - limit);
      content.style.translate = lift ? "0 -" + lift + "px" : "";
    };
    const placement = new MutationObserver(keepAboveBottom);
    placement.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
    const size = new ResizeObserver(keepAboveBottom);
    size.observe(wrapper);
    window.addEventListener("resize", keepAboveBottom);
    keepAboveBottom();
    return () => {
      placement.disconnect();
      size.disconnect();
      window.removeEventListener("resize", keepAboveBottom);
      clearRef();
    };
  }, [ref]);
}

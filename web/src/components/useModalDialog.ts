import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";

/**
 * Opens a native <dialog> as modal while the component is mounted (focus trap + inert page),
 * closes it on Esc and moves focus to `initialFocus`. The owner returns focus to the trigger in `onClose`.
 */
export function useModalDialog(onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    initialFocus?.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const requestClose = useCallback(() => {
    const dialog = ref.current;
    if (dialog?.open) dialog.close();
    onCloseRef.current();
  }, []);

  const dialogProps = {
    ref,
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      requestClose();
    },
    onKeyDown: (event: KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    },
  };

  return { requestClose, dialogProps };
}

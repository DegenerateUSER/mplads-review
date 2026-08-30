import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  FileSearch,
  MapPin,
  Search,
  SearchX,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface CommandItem {
  id: string;
  kind: "work" | "district";
  label: string;
  detail: string;
  keywords: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
}

export function CommandPalette({ items, onSelect }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return items.slice(0, 10);
    return items
      .filter((item) =>
        `${item.label} ${item.detail} ${item.keywords}`.toLocaleLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [items, query]);

  const groupedItems = useMemo(
    () => ({
      work: filteredItems.filter((item) => item.kind === "work"),
      district: filteredItems.filter((item) => item.kind === "district"),
    }),
    [filteredItems],
  );

  const openPalette = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setQuery("");
    setActiveIndex(0);
    setIsClosing(false);
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closePalette = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open || isClosing) return;
    setIsClosing(true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(
      () => {
        dialog.close();
        setIsClosing(false);
        triggerRef.current?.focus({ preventScroll: true });
      },
      reduceMotion ? 0 : 160,
    );
  }, [isClosing]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (dialogRef.current?.open) closePalette();
        else openPalette();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [closePalette, openPalette]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= filteredItems.length) setActiveIndex(0);
  }, [activeIndex, filteredItems.length]);

  const selectItem = (item: CommandItem) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closePalette();
    window.setTimeout(() => onSelect(item), reduceMotion ? 0 : 170);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!filteredItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filteredItems.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filteredItems.length) % filteredItems.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectItem(filteredItems[activeIndex]);
    }
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) closePalette();
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="search-trigger"
        type="button"
        aria-label="Search works and districts"
        aria-haspopup="dialog"
        aria-controls="command-palette"
        onClick={openPalette}
      >
        <Search aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className="search-trigger__label">Search works or districts</span>
        <kbd>⌘ / Ctrl K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        id="command-palette"
        className={isClosing ? "command-dialog is-closing" : "command-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
        onCancel={(event) => {
          event.preventDefault();
          closePalette();
        }}
        onClick={handleBackdropClick}
      >
        <div className="command-panel">
          <div className="command-field">
            <Search aria-hidden="true" size={19} strokeWidth={1.8} />
            <div className="command-field__input">
              <label className="sr-only" htmlFor="command-search">
                Search works and districts
              </label>
              <input
                ref={inputRef}
                id="command-search"
                type="search"
                role="combobox"
                autoComplete="off"
                aria-expanded="true"
                aria-controls="command-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  filteredItems.length ? `command-option-${activeIndex}` : undefined
                }
                placeholder="Type a work ID, title or district"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close search"
              onClick={closePalette}
            >
              <X aria-hidden="true" size={18} strokeWidth={1.8} />
            </button>
          </div>

          <div className="command-status" aria-live="polite">
            <h2 id="command-title">Search the review scope</h2>
            <span>
              {filteredItems.length} {filteredItems.length === 1 ? "result" : "results"}
            </span>
          </div>

          <div id="command-results" className="command-results" role="listbox">
            {filteredItems.length ? (
              (["work", "district"] as const).map((group) => {
                if (!groupedItems[group].length) return null;
                return (
                  <section key={group} className="command-group" aria-label={`${group} results`}>
                    <p className="command-group__label">
                      {group === "work" ? "Works" : "Districts"}
                    </p>
                    {groupedItems[group].map((item) => {
                      const itemIndex = filteredItems.indexOf(item);
                      const isActive = itemIndex === activeIndex;
                      return (
                        <button
                          id={`command-option-${itemIndex}`}
                          key={`${item.kind}-${item.id}`}
                          className={isActive ? "command-option is-active" : "command-option"}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          tabIndex={-1}
                          onMouseEnter={() => setActiveIndex(itemIndex)}
                          onClick={() => selectItem(item)}
                        >
                          <span className="command-option__icon" aria-hidden="true">
                            {item.kind === "work" ? (
                              <FileSearch size={18} strokeWidth={1.8} />
                            ) : (
                              <MapPin size={18} strokeWidth={1.8} />
                            )}
                          </span>
                          <span className="command-option__copy">
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </span>
                          <CornerDownLeft
                            className="command-option__enter"
                            aria-hidden="true"
                            size={16}
                            strokeWidth={1.8}
                          />
                        </button>
                      );
                    })}
                  </section>
                );
              })
            ) : (
              <div className="command-empty">
                <SearchX aria-hidden="true" size={24} strokeWidth={1.6} />
                <strong>No matching work or district</strong>
                <span>Try a shorter title, work ID or district name.</span>
              </div>
            )}
          </div>

          <div className="command-footer" aria-hidden="true">
            <span>
              <kbd>
                <ArrowUp size={12} />
              </kbd>
              <kbd>
                <ArrowDown size={12} />
              </kbd>
              Navigate
            </span>
            <span>
              <kbd>
                <CornerDownLeft size={12} />
              </kbd>
              Open
            </span>
            <span>
              <kbd>Esc</kbd>
              Close
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}

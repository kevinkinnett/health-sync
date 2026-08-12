import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

interface AutoGrowTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
}

function resizeTextarea(element: HTMLTextAreaElement, maxHeight: number) {
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}

/**
 * A controlled textarea that grows with its content until `maxHeight`, then
 * becomes internally scrollable. Keeping that behavior here prevents every
 * composer or notes field from reimplementing DOM measurement rules.
 */
export function AutoGrowTextarea({
  maxHeight = 160,
  onInput,
  style,
  value,
  ...props
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) resizeTextarea(ref.current, maxHeight);
  }, [value, maxHeight]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      onInput={(event) => {
        resizeTextarea(event.currentTarget, maxHeight);
        onInput?.(event);
      }}
      style={{ ...style, maxHeight }}
    />
  );
}

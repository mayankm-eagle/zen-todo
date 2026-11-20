import { forwardRef, useState } from "react";
import type { AddContext, Store } from "../todoist/store";

interface Props {
  store: Store;
  ctx?: AddContext;
  placeholder?: string;
}

export const AddTask = forwardRef<HTMLInputElement, Props>(function AddTask({ store, ctx, placeholder }, ref) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  return (
    <form
      className="add"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text;
        setText("");
        void store.add(t, ctx);
      }}
    >
      <span className="add-plus" aria-hidden="true">
        +
      </span>
      <input
        ref={ref}
        data-add-input
        value={text}
        placeholder={placeholder ?? "Add a task"}
        aria-label="Add a task"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setText("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {focused && (
        <p className="add-hint">
          <span>p1–p4 quadrant</span>
          <span>@shallow</span>
          <span>tomorrow 3pm</span>
          <span>#project</span>
          <span>↵ add</span>
        </p>
      )}
    </form>
  );
});

import { useEffect, useState } from "react";

interface Star {
  x: number;
  y: number;
  kind: "" | "dim" | "faint" | "bright";
  dur: number;
  delay: number;
}

/** A few pixel stars for when the day is clear. Dark mode only (see CSS). */
export function Sky() {
  const [stars, setStars] = useState<Star[]>([]);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const n = Math.min(40, Math.round((window.innerWidth * window.innerHeight) / 26000));
    setStars(
      Array.from({ length: n }, () => {
        const r = Math.random();
        return {
          x: Math.random() * 100,
          y: Math.random() * 100,
          kind: r < 0.08 ? "bright" : r < 0.45 ? "dim" : r < 0.7 ? "faint" : "",
          dur: 3 + Math.random() * 5,
          delay: Math.random() * 6,
        };
      }),
    );
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={on ? "sky on" : "sky"} aria-hidden="true">
      {stars.map((s, i) => (
        <div
          key={i}
          className={`star ${s.kind}`}
          style={{ left: `${s.x}%`, top: `${s.y}%`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

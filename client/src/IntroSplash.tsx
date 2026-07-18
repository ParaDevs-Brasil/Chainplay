import { useEffect, useRef, useState } from "react";

/* tela cheia com o vídeo de intro: toca uma vez e revela a landing page
   quando termina (ou quando o usuário pula). Roda em toda visita — sem
   flag de "já visto" em localStorage. */
export default function IntroSplash({ onFinish }: { onFinish: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [unmounted, setUnmounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    // a landing começa a aparecer por baixo enquanto o vídeo ainda está
    // desvanecendo por cima — crossfade em vez de um corte seco
    onFinish();
    setTimeout(() => setUnmounted(true), 600);
  };

  if (unmounted) return null;

  useEffect(() => {
    // alguns navegadores exigem play() explícito mesmo com autoPlay no mount
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className={`intro-splash${leaving ? " intro-splash-leaving" : ""}`}>
      <video
        ref={videoRef}
        className="intro-splash-video"
        src="/videos/videodemo.mp4"
        autoPlay
        muted
        playsInline
        onEnded={finish}
      />
      <button
        type="button"
        className="intro-splash-skip"
        onClick={finish}
      >
        close
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import Game from "./Game";
import Landing from "./Landing";

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route === "#/jogar" ? <Game /> : <Landing />;
}

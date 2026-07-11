import { useEffect, useState } from "react";
import Game from "./Game";
import GamesHub from "./GamesHub";
import Landing from "./Landing";
import WalletPage from "./WalletPage";

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  switch (route) {
    case "#/jogar":
      return <Game />;
    case "#/jogos":
      return <GamesHub />;
    case "#/carteira":
      return <WalletPage />;
    default:
      return <Landing />;
  }
}

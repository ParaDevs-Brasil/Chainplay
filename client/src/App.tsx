import { useEffect, useState } from "react";
import Arcade from "./Arcade";
import Game from "./Game";
import GamesHub from "./GamesHub";
import GuessStats from "./GuessStats";
import GuessTeam from "./GuessTeam";
import Landing from "./Landing";
import Markets from "./Markets";
import StakedHilo from "./StakedHilo";
import Survivor from "./Survivor";
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
    case "#/hilo-apostado":
      return <StakedHilo />;
    case "#/hilo-infinito":
      return <StakedHilo mode="infinite" />;
    case "#/stats":
      return <GuessStats />;
    case "#/survivor":
      return <Survivor />;
    case "#/penalty":
      return <Arcade game="penalty" />;
    case "#/live":
      return <Arcade game="live" />;
    case "#/team":
      return <GuessTeam />;
    case "#/mercados":
      return <Markets />;
    case "#/carteira":
      return <WalletPage />;
    default:
      return <Landing />;
  }
}

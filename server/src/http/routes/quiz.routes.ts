import { Router } from "express";
import { topBoard } from "../../games/leaderboard.js";
import { answerQuiz, startQuiz } from "../../games/quiz.js";
import { teamSession } from "../../games/teamSession.js";
import { registerSessionRoutes } from "../sessionRoutes.js";
import { asyncHandler } from "../errors.js";

export const quizRoutes = Router();

// Guess the Team valendo SOL: sessão house-backed de 5 rodadas com NFT do TEAM.
// Sob /staked/session* pra não colidir com as rotas do modo grátis abaixo.
const teamRouter = Router();
registerSessionRoutes(teamRouter, teamSession);
quizRoutes.use("/staked", teamRouter);

/* ---- modo grátis (ranking, sem stake) ---- */
quizRoutes.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { wallet, name } = req.body ?? {};
    res.json(await startQuiz(wallet, name));
  }),
);

quizRoutes.post("/:id/answer", (req, res) => {
  const { choice } = req.body ?? {};
  res.json(answerQuiz(req.params.id, String(choice ?? "")));
});

quizRoutes.get("/leaderboard", (_req, res) => {
  res.json({ top: topBoard("quiz") });
});

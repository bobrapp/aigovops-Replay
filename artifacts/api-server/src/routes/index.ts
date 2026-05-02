import { Router, type IRouter } from "express";
import healthRouter from "./health";
import interactionsRouter from "./interactions";
import policiesRouter from "./policies";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(interactionsRouter);
router.use(policiesRouter);

export default router;

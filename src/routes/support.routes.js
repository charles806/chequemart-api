import { Router } from "express";
import { createTicket, getMyTickets, getAllTickets, updateTicketStatus } from "../controllers/support.controller.js";
import { protect, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", protect, createTicket);
router.get("/", protect, getMyTickets);
router.get("/admin", protect, restrictTo("admin"), getAllTickets);
router.patch("/:id/status", protect, restrictTo("admin"), updateTicketStatus);

export default router;

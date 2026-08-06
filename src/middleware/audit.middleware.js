import AuditLog from "../models/AuditLog.model.js";

export const auditLog = (action, targetType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await AuditLog.create({
          action,
          actorId: req.user?._id,
          targetId: req.params?.id || req.body?._id,
          targetType,
          changes: { body: req.body },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      } catch (err) {
        console.error("Audit log error:", err.message);
      }
    }
    originalJson(body);
  };
  next();
};

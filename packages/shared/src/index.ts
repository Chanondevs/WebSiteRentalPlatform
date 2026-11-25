export type ApiHealthResponse = {
  status: "ok";
  service: string;
  timestamp: string;
};

export type UserRole = "USER" | "ADMIN";

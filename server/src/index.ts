import db from "./db/connection.js";
import { initSchema } from "./db/schema.js";
import { createApp } from "./app.js";

initSchema(db);

const app = createApp(db);
const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

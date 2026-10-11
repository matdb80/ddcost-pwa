/**
 * Diagnostica MySQL DDCost - sola lettura.
 * Nessun endpoint pubblico e nessuna credenziale nei log.
 */

import mysql from "mysql2/promise";

export async function runDbDiagnostics() {
  console.log("[DDCost] DB diagnostics started");

  const dbUrl = process.env.DATABASE_URL || "";

  if (!dbUrl) {
    console.log("[DDCost] DATABASE_URL missing");
    return;
  }

  let connection: mysql.Connection | undefined;

  try {
    connection = await mysql.createConnection({
      uri: dbUrl,
      connectTimeout: 8000,
    });

    console.log("[DDCost] DB connection: SUCCESS");
  } catch (err: any) {
    console.log("[DDCost] DB connection: FAILED");
    console.log("[DDCost] Error code:", err.code || "UNKNOWN");
    console.log("[DDCost] Error errno:", err.errno || "N/A");
    // Never log error.message verbatim: a driver error may contain credentials.
    // Only emit a safe classification to guide a staging connection fix.
    const diagnostic = String(err?.message || "").toLowerCase();
    const category =
      /ip address|ip is not|not in.*(whitelist|allowlist|network)|authorized network|firewall|not allowed to connect|public endpoint is disabled/.test(diagnostic) ? "NETWORK_ACCESS" :
      /tls|ssl|certificate|secure connection|handshake/.test(diagnostic) ? "TLS" :
      /access denied|authentication failed|incorrect password|invalid password|password authentication/.test(diagnostic) ? "CREDENTIALS" :
      /unknown database|database.*not found/.test(diagnostic) ? "DATABASE_NAME" :
      /cluster|branch|username|invalid user|not found/.test(diagnostic) ? "TIDB_TARGET" :
      "OTHER";
    console.log("[DDCost] DB failure category:", category);
    if (category === "TIDB_TARGET") {
      console.log("[DDCost] TiDB target detail:", [
        /branch/.test(diagnostic) ? "BRANCH" : null,
        /cluster/.test(diagnostic) ? "CLUSTER" : null,
        /username|invalid user|user not found/.test(diagnostic) ? "USERNAME" : null,
        /not found|does not exist|unknown/.test(diagnostic) ? "NOT_FOUND" : null,
        /not available|suspended|disabled/.test(diagnostic) ? "NOT_AVAILABLE" : null,
      ].filter(Boolean).join("+") || "UNCLASSIFIED");
    }
    return;
  }

  try {
    const [dbRows] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT DATABASE() AS db"
    );

    console.log(
      "[DDCost] Database selected:",
      dbRows[0]?.db ? "YES" : "NO"
    );

    const [tableRows] = await connection.execute<mysql.RowDataPacket[]>(
      "SHOW TABLES"
    );

    const tables = tableRows.map(
      (r: any) => Object.values(r)[0] as string
    );

    console.log("[DDCost] Tables found:", tables.length);

    const ddTables = [
      "cycles",
      "quotes",
      "cycle_simulations",
      "commercial_offers",
      "users",
    ];

    for (const t of ddTables) {
      if (!tables.includes(t)) {
        console.log(`[DDCost] Table [${t}]: NOT FOUND`);
        continue;
      }

      try {
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM \`${t}\``
        );

        console.log(
          `[DDCost] Table [${t}] rows:`,
          rows[0]?.cnt ?? "?"
        );
      } catch (err: any) {
        console.log(
          `[DDCost] Table [${t}] count error:`,
          err.code || "UNKNOWN",
          err.errno || "N/A"
        );
      }
    }

    if (tables.includes("cycles")) {
      try {
        const [cols] = await connection.execute<mysql.RowDataPacket[]>(
          "SELECT COLUMN_NAME, DATA_TYPE, " +
          "NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE " +
          "FROM INFORMATION_SCHEMA.COLUMNS " +
          "WHERE TABLE_NAME = 'cycles' " +
          "AND TABLE_SCHEMA = DATABASE() " +
          "ORDER BY ORDINAL_POSITION"
        );

        const schema = cols.map((r: any) => {
          const precision = r.NUMERIC_PRECISION
            ? `(${r.NUMERIC_PRECISION},${r.NUMERIC_SCALE})`
            : "";

          return `${r.COLUMN_NAME}:${r.DATA_TYPE}${precision}`;
        });

        console.log("[DDCost] Cycles schema:", schema.join(" | "));
      } catch (err: any) {
        console.log(
          "[DDCost] Cycles schema error:",
          err.code || "UNKNOWN"
        );
      }
    }
  } catch (err: any) {
    console.log(
      "[DDCost] Query execution error:",
      err.code || "UNKNOWN",
      err.errno || "N/A"
    );
  } finally {
    try {
      await connection.end();
      console.log("[DDCost] DB connection closed");
    } catch (err: any) {
      console.log(
        "[DDCost] DB connection close error:",
        err.code || "UNKNOWN"
      );
    }
  }

  console.log("[DDCost] DB diagnostics complete");
}

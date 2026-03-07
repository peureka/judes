import { redirect } from "next/navigation";
import { sql } from "../../../../db/index.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const f = searchParams.get("f");
  const t = searchParams.get("t");

  if (!f) {
    redirect("/");
  }

  if (t === "respond") {
    // Fire-and-forget: log click without blocking redirect
    sql`INSERT INTO find_clicks (find_record_id, click_type) VALUES (${f}, ${t})`.catch(
      (err) => console.error("click log failed:", err.message)
    );
    redirect(`/timeline?find=${f}`);
  }

  // For spotify/other clicks, we need the source_url so must await
  const [logResult, findResult] = await Promise.all([
    sql`INSERT INTO find_clicks (find_record_id, click_type) VALUES (${f}, ${t || "unknown"})`,
    sql`SELECT source_url FROM find_records WHERE id = ${f}`,
  ]);

  if (!findResult.length || !findResult[0].source_url) {
    redirect("/");
  }

  redirect(findResult[0].source_url);
}

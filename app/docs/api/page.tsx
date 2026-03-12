import { redirect } from "next/navigation";

export default function ApiDocsPage() {
  redirect("/?view=api-docs");
}

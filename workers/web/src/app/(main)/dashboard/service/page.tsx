import { redirect } from "next/navigation";

export default function LegacyServiceRedirect() {
  redirect("/dashboard/workflow/services");
}

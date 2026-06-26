import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformAdmins } from "@/components/platform/platform-admins";
import { prisma } from "@/lib/db/prisma";
import { getRequestSession } from "@/lib/auth/http";
import { listPlatformAdmins } from "@/lib/platform/platform-admin-service";

export default async function PlatformAdminsPage() {
  const session = await getRequestSession();
  if (!session || session.type !== "platform") redirect("/platform/login");

  const admins = await listPlatformAdmins(prisma);

  return (
    <PlatformShell active="admins" title="مدراء المنصّة" description="إدارة حسابات مدراء المنصّة وتغيير كلمة مرورك.">
      <PlatformAdmins initialAdmins={admins} currentAdminId={session.admin.id} />
    </PlatformShell>
  );
}

"use client";

import AddSesConfiguration from "./add-ses-configuration";
import SesConfigurations from "./ses-configurations";
import { AdminPage } from "~/components/admin/kit";

export default function AdminSesPage() {
  return (
    <AdminPage
      title="SES"
      description="Regiones de Amazon SES desde las que envía la plataforma y el estado del callback que recibe entregas, rebotes y quejas."
      actions={<AddSesConfiguration />}
    >
      <SesConfigurations />
    </AdminPage>
  );
}

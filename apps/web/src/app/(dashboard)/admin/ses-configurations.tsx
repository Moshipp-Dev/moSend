"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";
import Spinner from "@usesend/ui/src/spinner";
import EditSesConfiguration from "./edit-ses-configuration";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";

export default function SesConfigurations() {
  const sesSettingsQuery = api.admin.getSesSettings.useQuery();

  return (
    <div className="">
      <div className="border rounded-xl shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted/30">
              <TableHead className="rounded-tl-xl">Región</TableHead>
              <TableHead>Clave de prefijo</TableHead>
              <TableHead>URL de callback</TableHead>
              <TableHead>Estado del callback</TableHead>
              <TableHead>Creado el</TableHead>
              <TableHead>Tasa de envío</TableHead>
              <TableHead>Cuota transaccional</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sesSettingsQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : sesSettingsQuery.data?.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <p>No se han agregado configuraciones SES</p>
                </TableCell>
              </TableRow>
            ) : (
              sesSettingsQuery.data?.map((sesSetting) => (
                <TableRow key={sesSetting.id}>
                  <TableCell>{sesSetting.region}</TableCell>
                  <TableCell>{sesSetting.idPrefix}</TableCell>
                  <TableCell>
                    <div className="w-[200px] overflow-hidden text-ellipsis">
                      <TextWithCopyButton
                        value={sesSetting.callbackUrl}
                        className="w-[200px] overflow-hidden text-ellipsis"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {sesSetting.callbackSuccess ? "Exitoso" : "Fallido"}
                  </TableCell>
                  <TableCell>
                    hace {formatDistanceToNow(sesSetting.createdAt)}
                  </TableCell>
                  <TableCell>{sesSetting.sesEmailRateLimit}</TableCell>
                  <TableCell>{sesSetting.transactionalQuota}%</TableCell>
                  <TableCell>
                    <EditSesConfiguration setting={sesSetting} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

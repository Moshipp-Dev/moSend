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
import DeleteApiKey from "./delete-api-key";
import { EditApiKeyDialog } from "./edit-api-key";
import Spinner from "@usesend/ui/src/spinner";
import { useState } from "react";
import { Edit3 } from "lucide-react";
import { Button } from "@usesend/ui/src/button";

export default function ApiList() {
  const apiKeysQuery = api.apiKey.getApiKeys.useQuery();
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="mt-10">
      <div className="border rounded-xl shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted/30">
              <TableHead className="rounded-tl-xl">Nombre</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Permiso</TableHead>
              <TableHead>Acceso a dominio</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead>Creada el</TableHead>
              <TableHead className="rounded-tr-xl">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeysQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={7} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : apiKeysQuery.data?.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={7} className="text-center py-4">
                  <p>No hay claves API agregadas</p>
                </TableCell>
              </TableRow>
            ) : (
              apiKeysQuery.data?.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>{apiKey.name}</TableCell>
                  <TableCell>{apiKey.partialToken}</TableCell>
                  <TableCell>{apiKey.permission}</TableCell>
                  <TableCell>
                    {apiKey.domainId
                      ? apiKey.domain?.name ?? "Dominio eliminado"
                      : "Todos los dominios"}
                  </TableCell>
                  <TableCell>
                    {apiKey.lastUsed
                      ? formatDistanceToNow(apiKey.lastUsed, {
                          addSuffix: true,
                        })
                      : "Nunca"}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(apiKey.createdAt, {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(apiKey.id)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <DeleteApiKey apiKey={apiKey} />
                      <EditApiKeyDialog
                        apiKey={apiKey}
                        open={editingId === apiKey.id}
                        onOpenChange={(open) => {
                          if (!open) setEditingId(null);
                        }}
                      />
                    </div>
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

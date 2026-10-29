export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      avisos_pendientes: {
        Row: {
          creado_en: string
          cuerpo: string
          enviado_en: string | null
          id: string
          marca_id: string
          titulo: string
          url: string
        }
        Insert: {
          creado_en?: string
          cuerpo: string
          enviado_en?: string | null
          id?: string
          marca_id: string
          titulo: string
          url: string
        }
        Update: {
          creado_en?: string
          cuerpo?: string
          enviado_en?: string | null
          id?: string
          marca_id?: string
          titulo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_pendientes_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      casos: {
        Row: {
          anio: number | null
          capacidades: string[]
          cargado_en: string
          ciudad: string | null
          cliente: string
          era: string
          frase_citable: string | null
          industria: string | null
          pais: string | null
          resumen: string
          rol: string
          slug: string
          tipos_de_trabajo: string[]
          titulo: string
        }
        Insert: {
          anio?: number | null
          capacidades?: string[]
          cargado_en?: string
          ciudad?: string | null
          cliente: string
          era: string
          frase_citable?: string | null
          industria?: string | null
          pais?: string | null
          resumen?: string
          rol?: string
          slug: string
          tipos_de_trabajo?: string[]
          titulo: string
        }
        Update: {
          anio?: number | null
          capacidades?: string[]
          cargado_en?: string
          ciudad?: string | null
          cliente?: string
          era?: string
          frase_citable?: string | null
          industria?: string | null
          pais?: string | null
          resumen?: string
          rol?: string
          slug?: string
          tipos_de_trabajo?: string[]
          titulo?: string
        }
        Relationships: []
      }
      conexiones: {
        Row: {
          app: string
          conectada_en: string
          conectada_por: string
          expira_en: string
          id: string
          nombre: string | null
          red: string
          scopes: string[]
          titular: string
        }
        Insert: {
          app: string
          conectada_en?: string
          conectada_por: string
          expira_en: string
          id?: string
          nombre?: string | null
          red: string
          scopes: string[]
          titular: string
        }
        Update: {
          app?: string
          conectada_en?: string
          conectada_por?: string
          expira_en?: string
          id?: string
          nombre?: string | null
          red?: string
          scopes?: string[]
          titular?: string
        }
        Relationships: []
      }
      cuentas: {
        Row: {
          conexion_id: string | null
          creada_en: string
          id: string
          marca_id: string
          nombre: string
          red: string
          ritmo_semanal: number
          ruta: string
          tipo: string
        }
        Insert: {
          conexion_id?: string | null
          creada_en?: string
          id?: string
          marca_id: string
          nombre: string
          red: string
          ritmo_semanal?: number
          ruta: string
          tipo: string
        }
        Update: {
          conexion_id?: string | null
          creada_en?: string
          id?: string
          marca_id?: string
          nombre?: string
          red?: string
          ritmo_semanal?: number
          ruta?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_conexion_id_fkey"
            columns: ["conexion_id"]
            isOneToOne: false
            referencedRelation: "conexiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          a: string
          de: string | null
          en: string
          id: number
          motivo: string | null
          pieza_id: string
          por: string | null
        }
        Insert: {
          a: string
          de?: string | null
          en?: string
          id?: never
          motivo?: string | null
          pieza_id: string
          por?: string | null
        }
        Update: {
          a?: string
          de?: string | null
          en?: string
          id?: never
          motivo?: string | null
          pieza_id?: string
          por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      excepciones: {
        Row: {
          alias: string[]
          caso_slug: string | null
          cliente: string
          hasta: string | null
          id: string
          puesta_en: string
          puesta_por: string | null
          quitada_en: string | null
          quitada_por: string | null
          tipo: string
        }
        Insert: {
          alias?: string[]
          caso_slug?: string | null
          cliente: string
          hasta?: string | null
          id?: string
          puesta_en?: string
          puesta_por?: string | null
          quitada_en?: string | null
          quitada_por?: string | null
          tipo: string
        }
        Update: {
          alias?: string[]
          caso_slug?: string | null
          cliente?: string
          hasta?: string | null
          id?: string
          puesta_en?: string
          puesta_por?: string | null
          quitada_en?: string | null
          quitada_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "excepciones_caso_slug_fkey"
            columns: ["caso_slug"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["slug"]
          },
        ]
      }
      firmas: {
        Row: {
          firmada_en: string
          firmada_por: string
          huella: string
          id: string
          para_reserva: boolean
          pieza_id: string
          programada_para: string | null
          version_id: string
          vigente: boolean
        }
        Insert: {
          firmada_en?: string
          firmada_por: string
          huella: string
          id?: string
          para_reserva?: boolean
          pieza_id: string
          programada_para?: string | null
          version_id: string
          vigente?: boolean
        }
        Update: {
          firmada_en?: string
          firmada_por?: string
          huella?: string
          id?: string
          para_reserva?: boolean
          pieza_id?: string
          programada_para?: string | null
          version_id?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "firmas_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firmas_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      lineas_editoriales: {
        Row: {
          creada_en: string
          creada_por: string
          de_que_hablamos: string
          ejemplos: string
          formatos: string
          id: string
          marca_id: string
          pilares: Json
          temas_a_vigilar: string
          temas_vetados: string
          tono: string
          version: number
        }
        Insert: {
          creada_en?: string
          creada_por: string
          de_que_hablamos?: string
          ejemplos?: string
          formatos?: string
          id?: string
          marca_id: string
          pilares: Json
          temas_a_vigilar?: string
          temas_vetados?: string
          tono?: string
          version: number
        }
        Update: {
          creada_en?: string
          creada_por?: string
          de_que_hablamos?: string
          ejemplos?: string
          formatos?: string
          id?: string
          marca_id?: string
          pilares?: Json
          temas_a_vigilar?: string
          temas_vetados?: string
          tono?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineas_editoriales_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas: {
        Row: {
          creada_en: string
          id: string
          nombre: string
          voz: string
        }
        Insert: {
          creada_en?: string
          id?: string
          nombre: string
          voz: string
        }
        Update: {
          creada_en?: string
          id?: string
          nombre?: string
          voz?: string
        }
        Relationships: []
      }
      miembros: {
        Row: {
          creado_en: string
          marca_id: string
          rol: string
          user_id: string
        }
        Insert: {
          creado_en?: string
          marca_id: string
          rol?: string
          user_id: string
        }
        Update: {
          creado_en?: string
          marca_id?: string
          rol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      piezas: {
        Row: {
          arrendada_hasta: string | null
          creada_en: string
          creada_por: string
          cuenta_id: string
          enlace: string | null
          estado: string
          formato: string
          id: string
          motivo: string | null
          pilar_id: string | null
          plan_fallo_en: string | null
          planeada_para: string | null
          programada_para: string | null
          ventana_minutos: number
        }
        Insert: {
          arrendada_hasta?: string | null
          creada_en?: string
          creada_por: string
          cuenta_id: string
          enlace?: string | null
          estado?: string
          formato: string
          id?: string
          motivo?: string | null
          pilar_id?: string | null
          plan_fallo_en?: string | null
          planeada_para?: string | null
          programada_para?: string | null
          ventana_minutos?: number
        }
        Update: {
          arrendada_hasta?: string | null
          creada_en?: string
          creada_por?: string
          cuenta_id?: string
          enlace?: string | null
          estado?: string
          formato?: string
          id?: string
          motivo?: string | null
          pilar_id?: string | null
          plan_fallo_en?: string | null
          planeada_para?: string | null
          programada_para?: string | null
          ventana_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "piezas_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piezas_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "pilares"
            referencedColumns: ["id"]
          },
        ]
      }
      pilares: {
        Row: {
          activo: boolean
          creado_en: string
          de_que_habla: string
          id: string
          marca_id: string
          material: string
          nombre: string
          orden: number
          por_semana: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          de_que_habla?: string
          id?: string
          marca_id: string
          material?: string
          nombre: string
          orden: number
          por_semana: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          de_que_habla?: string
          id?: string
          marca_id?: string
          material?: string
          nombre?: string
          orden?: number
          por_semana?: number
        }
        Relationships: [
          {
            foreignKeyName: "pilares_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      publicaciones: {
        Row: {
          enlace: string | null
          enviado_en: string
          firma_id: string
          id: string
          pieza_id: string
          post_urn: string | null
          version_id: string
        }
        Insert: {
          enlace?: string | null
          enviado_en?: string
          firma_id: string
          id?: string
          pieza_id: string
          post_urn?: string | null
          version_id: string
        }
        Update: {
          enlace?: string | null
          enviado_en?: string
          firma_id?: string
          id?: string
          pieza_id?: string
          post_urn?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publicaciones_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: true
            referencedRelation: "firmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicaciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicaciones_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones_push: {
        Row: {
          auth: string
          creada_en: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          creada_en?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          creada_en?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      versiones: {
        Row: {
          archivo_ruta: string | null
          archivo_sha256: string | null
          creada_en: string
          creada_por: string | null
          huella: string
          id: string
          numero: number
          pieza_id: string
          texto: string
          titulo: string | null
        }
        Insert: {
          archivo_ruta?: string | null
          archivo_sha256?: string | null
          creada_en?: string
          creada_por?: string | null
          huella: string
          id?: string
          numero: number
          pieza_id: string
          texto: string
          titulo?: string | null
        }
        Update: {
          archivo_ruta?: string | null
          archivo_sha256?: string | null
          creada_en?: string
          creada_por?: string | null
          huella?: string
          id?: string
          numero?: number
          pieza_id?: string
          texto?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "versiones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cerrar_a_mano: {
        Args: { p_enlace: string; p_pieza: string }
        Returns: undefined
      }
      cerrar_envio: {
        Args: { p_enlace: string; p_pieza: string; p_urn: string }
        Returns: undefined
      }
      conectar_linkedin: {
        Args: {
          p_cuenta: string
          p_expira_en: string
          p_nombre: string
          p_scopes: string[]
          p_titular: string
          p_token: string
        }
        Returns: string
      }
      crear_marca: {
        Args: { p_nombre: string; p_voz: string }
        Returns: string
      }
      crear_pieza: {
        Args: {
          p_archivo_ruta?: string
          p_archivo_sha256?: string
          p_cuenta: string
          p_formato: string
          p_texto: string
          p_titulo?: string
        }
        Returns: string
      }
      credencial_de_cuenta: {
        Args: { p_cuenta: string }
        Returns: {
          expira_en: string
          titular: string
          token: string
        }[]
      }
      cubrir_con_reserva: {
        Args: { p_pendiente: string; p_siguiente: string }
        Returns: string
      }
      descartar_pieza: {
        Args: { p_motivo: string; p_pieza: string }
        Returns: undefined
      }
      desconectar_cuenta: { Args: { p_cuenta: string }; Returns: undefined }
      desprogramar_pieza: { Args: { p_pieza: string }; Returns: undefined }
      devolver_pieza: {
        Args: { p_a_la_reserva: boolean; p_motivo: string; p_pieza: string }
        Returns: string
      }
      dudoso_a_mano: { Args: { p_pieza: string }; Returns: undefined }
      es_dueno: { Args: { p_marca: string }; Returns: boolean }
      es_dueno_de_alguna: { Args: never; Returns: boolean }
      es_miembro: { Args: { p_marca: string }; Returns: boolean }
      firmar_para_reserva: {
        Args: { p_huella: string; p_pieza: string }
        Returns: string
      }
      firmar_pieza: {
        Args: { p_huella: string; p_pieza: string; p_programada_para: string }
        Returns: string
      }
      guardar_linea: {
        Args: {
          p_autor: string
          p_base: number
          p_marca: string
          p_pilares: Json
          p_secciones: Json
        }
        Returns: number
      }
      guardar_linea_editorial: {
        Args: {
          p_base: number
          p_marca: string
          p_pilares: Json
          p_secciones: Json
        }
        Returns: number
      }
      marca_de_pieza: { Args: { p_pieza: string }; Returns: string }
      marcar_excepcion: {
        Args: {
          p_alias: string[]
          p_caso?: string
          p_cliente: string
          p_hasta?: string
          p_tipo: string
        }
        Returns: string
      }
      normalizar_texto: { Args: { p: string }; Returns: string }
      nueva_version: {
        Args: {
          p_archivo_ruta?: string
          p_archivo_sha256?: string
          p_pieza: string
          p_texto: string
          p_titulo?: string
        }
        Returns: string
      }
      planear_pieza: {
        Args: { p_fecha: string; p_pieza: string }
        Returns: undefined
      }
      poner_pilar: {
        Args: { p_pieza: string; p_pilar?: string }
        Returns: undefined
      }
      quitar_excepcion: { Args: { p_id: string }; Returns: undefined }
      registrar_falla_de_espacio: {
        Args: { p_motivo: string; p_pieza: string }
        Returns: boolean
      }
      reservar_envio: {
        Args: { p_firma: string; p_pieza: string; p_version: string }
        Returns: string
      }
      sacar_de_reserva: { Args: { p_pieza: string }; Returns: undefined }
      tiene_acceso: { Args: never; Returns: boolean }
      tomar_para_publicar: {
        Args: never
        Returns: {
          arrendada_hasta: string | null
          creada_en: string
          creada_por: string
          cuenta_id: string
          enlace: string | null
          estado: string
          formato: string
          id: string
          motivo: string | null
          pilar_id: string | null
          plan_fallo_en: string | null
          planeada_para: string | null
          programada_para: string | null
          ventana_minutos: number
        }[]
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      transiciones_de_pieza: {
        Args: never
        Returns: {
          a: string[]
          de: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


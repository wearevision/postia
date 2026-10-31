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
      asignaciones: {
        Row: {
          arrendado_hasta: string | null
          creada_en: string
          cuenta_id: string
          estado: string
          formato: string
          id: string
          idea_id: string
          intentos: number
          motivo: string | null
          pedido_de_diseno_id: string | null
          pieza_id: string | null
          planeada_para: string
        }
        Insert: {
          arrendado_hasta?: string | null
          creada_en?: string
          cuenta_id: string
          estado?: string
          formato: string
          id?: string
          idea_id: string
          intentos?: number
          motivo?: string | null
          pedido_de_diseno_id?: string | null
          pieza_id?: string | null
          planeada_para: string
        }
        Update: {
          arrendado_hasta?: string | null
          creada_en?: string
          cuenta_id?: string
          estado?: string
          formato?: string
          id?: string
          idea_id?: string
          intentos?: number
          motivo?: string | null
          pedido_de_diseno_id?: string | null
          pieza_id?: string | null
          planeada_para?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_pedido_de_diseno_id_fkey"
            columns: ["pedido_de_diseno_id"]
            isOneToOne: false
            referencedRelation: "pedidos_de_diseno"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_de_tope: {
        Row: {
          alcance: string
          creado_en: string
          mes: string
          umbral: number
        }
        Insert: {
          alcance: string
          creado_en?: string
          mes: string
          umbral: number
        }
        Update: {
          alcance?: string
          creado_en?: string
          mes?: string
          umbral?: number
        }
        Relationships: []
      }
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
          organizacion: string | null
          red: string
          renovacion_expira_en: string | null
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
          organizacion?: string | null
          red: string
          renovacion_expira_en?: string | null
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
          organizacion?: string | null
          red?: string
          renovacion_expira_en?: string | null
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
      elecciones_de_pagina: {
        Row: {
          conectada_por: string
          creada_en: string
          cuenta_id: string
          expira_en: string
          id: string
          nombre: string | null
          paginas: Json
          renovacion_expira_en: string | null
          scopes: string[]
          titular: string
        }
        Insert: {
          conectada_por: string
          creada_en?: string
          cuenta_id: string
          expira_en: string
          id?: string
          nombre?: string | null
          paginas: Json
          renovacion_expira_en?: string | null
          scopes: string[]
          titular: string
        }
        Update: {
          conectada_por?: string
          creada_en?: string
          cuenta_id?: string
          expira_en?: string
          id?: string
          nombre?: string | null
          paginas?: Json
          renovacion_expira_en?: string | null
          scopes?: string[]
          titular?: string
        }
        Relationships: [
          {
            foreignKeyName: "elecciones_de_pagina_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
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
      gastos: {
        Row: {
          cerrado_en: string | null
          clave: string
          creado_en: string
          estado: string
          estimado_micro: number
          id: string
          marca_id: string | null
          mes: string
          paso: string
          proveedor: string
          real_micro: number | null
        }
        Insert: {
          cerrado_en?: string | null
          clave: string
          creado_en?: string
          estado?: string
          estimado_micro: number
          id?: string
          marca_id?: string | null
          mes: string
          paso: string
          proveedor: string
          real_micro?: number | null
        }
        Update: {
          cerrado_en?: string | null
          clave?: string
          creado_en?: string
          estado?: string
          estimado_micro?: number
          id?: string
          marca_id?: string | null
          mes?: string
          paso?: string
          proveedor?: string
          real_micro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      hallazgos: {
        Row: {
          angulo: string | null
          cita: string | null
          creado_en: string
          enlace: string
          enlace_normalizado: string
          estado: string
          id: string
          investigacion_id: string | null
          medio: string
          publicado_en: string | null
          resumen: string
          tema_id: string | null
          vector: string
        }
        Insert: {
          angulo?: string | null
          cita?: string | null
          creado_en?: string
          enlace: string
          enlace_normalizado: string
          estado?: string
          id?: string
          investigacion_id?: string | null
          medio?: string
          publicado_en?: string | null
          resumen: string
          tema_id?: string | null
          vector: string
        }
        Update: {
          angulo?: string | null
          cita?: string | null
          creado_en?: string
          enlace?: string
          enlace_normalizado?: string
          estado?: string
          id?: string
          investigacion_id?: string | null
          medio?: string
          publicado_en?: string | null
          resumen?: string
          tema_id?: string | null
          vector?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgos_investigacion_id_fkey"
            columns: ["investigacion_id"]
            isOneToOne: false
            referencedRelation: "investigaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgos_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          aprobada_por: string | null
          creada_en: string
          cuenta_sugerida: string
          esqueleto: Json
          estado: string
          formato: string
          fuentes: string[]
          gancho: string
          id: string
          investigacion_id: string | null
          orden: number
          pilar_id: string | null
          razon: string
          reemplaza_a: string | null
          resumen: string
          vector: string
        }
        Insert: {
          aprobada_por?: string | null
          creada_en?: string
          cuenta_sugerida: string
          esqueleto: Json
          estado?: string
          formato: string
          fuentes: string[]
          gancho: string
          id?: string
          investigacion_id?: string | null
          orden?: number
          pilar_id?: string | null
          razon: string
          reemplaza_a?: string | null
          resumen: string
          vector: string
        }
        Update: {
          aprobada_por?: string | null
          creada_en?: string
          cuenta_sugerida?: string
          esqueleto?: Json
          estado?: string
          formato?: string
          fuentes?: string[]
          gancho?: string
          id?: string
          investigacion_id?: string | null
          orden?: number
          pilar_id?: string | null
          razon?: string
          reemplaza_a?: string | null
          resumen?: string
          vector?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_cuenta_sugerida_fkey"
            columns: ["cuenta_sugerida"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_investigacion_id_fkey"
            columns: ["investigacion_id"]
            isOneToOne: false
            referencedRelation: "investigaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "pilares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      investigaciones: {
        Row: {
          angulos: Json
          cantidad: number | null
          cerrada_en: string | null
          creada_en: string
          descartados: number
          dia: string | null
          enfoque: string | null
          estado: string
          formato: string | null
          id: string
          motivo: string | null
          origen: string
          pedida_por: string | null
          repetidos: number
          tema: string
        }
        Insert: {
          angulos?: Json
          cantidad?: number | null
          cerrada_en?: string | null
          creada_en?: string
          descartados?: number
          dia?: string | null
          enfoque?: string | null
          estado?: string
          formato?: string | null
          id?: string
          motivo?: string | null
          origen: string
          pedida_por?: string | null
          repetidos?: number
          tema: string
        }
        Update: {
          angulos?: Json
          cantidad?: number | null
          cerrada_en?: string | null
          creada_en?: string
          descartados?: number
          dia?: string | null
          enfoque?: string | null
          estado?: string
          formato?: string | null
          id?: string
          motivo?: string | null
          origen?: string
          pedida_por?: string | null
          repetidos?: number
          tema?: string
        }
        Relationships: []
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
      pedidos_de_diseno: {
        Row: {
          arrendado_hasta: string | null
          asignacion_id: string | null
          creado_en: string
          cuenta_id: string
          diseno: Json
          estado: string
          id: string
          intentos: number
          linea_version: number | null
          motivo: string | null
          origen: string
          pedido_por: string
          pieza_id: string | null
          planeada_para: string | null
          resultado_pieza_id: string | null
          tema: string
          terminado_en: string | null
          texto: string
          titulo: string
          version_base_id: string | null
        }
        Insert: {
          arrendado_hasta?: string | null
          asignacion_id?: string | null
          creado_en?: string
          cuenta_id: string
          diseno: Json
          estado?: string
          id?: string
          intentos?: number
          linea_version?: number | null
          motivo?: string | null
          origen?: string
          pedido_por: string
          pieza_id?: string | null
          planeada_para?: string | null
          resultado_pieza_id?: string | null
          tema: string
          terminado_en?: string | null
          texto: string
          titulo: string
          version_base_id?: string | null
        }
        Update: {
          arrendado_hasta?: string | null
          asignacion_id?: string | null
          creado_en?: string
          cuenta_id?: string
          diseno?: Json
          estado?: string
          id?: string
          intentos?: number
          linea_version?: number | null
          motivo?: string | null
          origen?: string
          pedido_por?: string
          pieza_id?: string | null
          planeada_para?: string | null
          resultado_pieza_id?: string | null
          tema?: string
          terminado_en?: string | null
          texto?: string
          titulo?: string
          version_base_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_de_diseno_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_diseno_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_diseno_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_diseno_resultado_pieza_id_fkey"
            columns: ["resultado_pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_diseno_version_base_id_fkey"
            columns: ["version_base_id"]
            isOneToOne: false
            referencedRelation: "versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_de_texto: {
        Row: {
          arrendado_hasta: string | null
          creado_en: string
          cuenta_id: string
          encargo: string | null
          estado: string
          id: string
          instruccion: string | null
          material: string | null
          motivo: string | null
          pedido_por: string
          pieza_id: string | null
          pilar_id: string | null
          resultado_pieza_id: string | null
          terminado_en: string | null
          tipo: string
          version_id: string | null
        }
        Insert: {
          arrendado_hasta?: string | null
          creado_en?: string
          cuenta_id: string
          encargo?: string | null
          estado?: string
          id?: string
          instruccion?: string | null
          material?: string | null
          motivo?: string | null
          pedido_por: string
          pieza_id?: string | null
          pilar_id?: string | null
          resultado_pieza_id?: string | null
          terminado_en?: string | null
          tipo: string
          version_id?: string | null
        }
        Update: {
          arrendado_hasta?: string | null
          creado_en?: string
          cuenta_id?: string
          encargo?: string | null
          estado?: string
          id?: string
          instruccion?: string | null
          material?: string | null
          motivo?: string | null
          pedido_por?: string
          pieza_id?: string | null
          pilar_id?: string | null
          resultado_pieza_id?: string | null
          terminado_en?: string | null
          tipo?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_de_texto_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_texto_pieza_id_fkey"
            columns: ["pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_texto_pilar_id_fkey"
            columns: ["pilar_id"]
            isOneToOne: false
            referencedRelation: "pilares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_texto_resultado_pieza_id_fkey"
            columns: ["resultado_pieza_id"]
            isOneToOne: false
            referencedRelation: "piezas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_de_texto_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versiones"
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
      revisiones_ia: {
        Row: {
          creada_en: string
          veredicto: Json
          version_id: string
        }
        Insert: {
          creada_en?: string
          veredicto: Json
          version_id: string
        }
        Update: {
          creada_en?: string
          veredicto?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisiones_ia_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      sugerencias_de_investigacion: {
        Row: {
          creada_en: string
          enriquece: string
          id: string
          tema: string
        }
        Insert: {
          creada_en?: string
          enriquece: string
          id?: string
          tema: string
        }
        Update: {
          creada_en?: string
          enriquece?: string
          id?: string
          tema?: string
        }
        Relationships: []
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
      temas: {
        Row: {
          alias: string[]
          centroide: string | null
          creado_en: string
          descripcion: string
          fusionado_en: string | null
          id: string
          nombre: string
        }
        Insert: {
          alias?: string[]
          centroide?: string | null
          creado_en?: string
          descripcion?: string
          fusionado_en?: string | null
          id?: string
          nombre: string
        }
        Update: {
          alias?: string[]
          centroide?: string | null
          creado_en?: string
          descripcion?: string
          fusionado_en?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "temas_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
        ]
      }
      topes: {
        Row: {
          desde_mes: string
          id: number
          marca_id: string | null
          monto_micro: number | null
          puesto_en: string
          puesto_por: string | null
        }
        Insert: {
          desde_mes: string
          id?: never
          marca_id?: string | null
          monto_micro?: number | null
          puesto_en?: string
          puesto_por?: string | null
        }
        Update: {
          desde_mes?: string
          id?: never
          marca_id?: string | null
          monto_micro?: number | null
          puesto_en?: string
          puesto_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topes_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajos_de_investigacion: {
        Row: {
          angulo: string | null
          arrendado_hasta: string | null
          creado_en: string
          estado: string
          id: string
          idea_id: string | null
          intentos: number
          investigacion_id: string
          motivo: string | null
          terminado_en: string | null
          tipo: string
        }
        Insert: {
          angulo?: string | null
          arrendado_hasta?: string | null
          creado_en?: string
          estado?: string
          id?: string
          idea_id?: string | null
          intentos?: number
          investigacion_id: string
          motivo?: string | null
          terminado_en?: string | null
          tipo: string
        }
        Update: {
          angulo?: string | null
          arrendado_hasta?: string | null
          creado_en?: string
          estado?: string
          id?: string
          idea_id?: string | null
          intentos?: number
          investigacion_id?: string
          motivo?: string | null
          terminado_en?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_de_investigacion_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_de_investigacion_investigacion_id_fkey"
            columns: ["investigacion_id"]
            isOneToOne: false
            referencedRelation: "investigaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      versiones: {
        Row: {
          archivo_ruta: string | null
          archivo_sha256: string | null
          creada_en: string
          creada_por: string | null
          diseno: Json | null
          huella: string
          id: string
          linea_version: number | null
          numero: number
          origen: string
          pieza_id: string
          tema: string | null
          texto: string
          titulo: string | null
        }
        Insert: {
          archivo_ruta?: string | null
          archivo_sha256?: string | null
          creada_en?: string
          creada_por?: string | null
          diseno?: Json | null
          huella: string
          id?: string
          linea_version?: number | null
          numero: number
          origen?: string
          pieza_id: string
          tema?: string | null
          texto: string
          titulo?: string | null
        }
        Update: {
          archivo_ruta?: string | null
          archivo_sha256?: string | null
          creada_en?: string
          creada_por?: string | null
          diseno?: Json | null
          huella?: string
          id?: string
          linea_version?: number | null
          numero?: number
          origen?: string
          pieza_id?: string
          tema?: string | null
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
      aprobar_idea: {
        Args: { p_asignaciones: Json; p_idea: string }
        Returns: string[]
      }
      aprobar_informe: { Args: { p_investigacion: string }; Returns: undefined }
      barrer_elecciones: { Args: { p_ahora?: string }; Returns: number }
      barrer_gastos: { Args: { p_ahora?: string }; Returns: number }
      cambiar_ruta: {
        Args: { p_cuenta: string; p_ruta: string }
        Returns: undefined
      }
      cerrar_a_mano: {
        Args: { p_enlace: string; p_pieza: string }
        Returns: undefined
      }
      cerrar_envio: {
        Args: { p_enlace: string; p_pieza: string; p_urn: string }
        Returns: undefined
      }
      cerrar_investigacion: {
        Args: {
          p_angulos: Json
          p_descartados?: number
          p_investigacion: string
          p_repetidos?: number
        }
        Returns: undefined
      }
      conectar_linkedin: {
        Args: {
          p_app?: string
          p_cuenta: string
          p_expira_en: string
          p_nombre: string
          p_organizacion?: string
          p_renovacion?: string
          p_renovacion_expira_en?: string
          p_scopes: string[]
          p_titular: string
          p_token: string
        }
        Returns: string
      }
      confirmar_gasto: {
        Args: { p_ahora?: string; p_clave: string; p_real_micro: number }
        Returns: Json
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
      crear_pieza_de_asignacion: {
        Args: {
          p_asignacion: string
          p_linea_version: number
          p_planeada_para: string
          p_texto: string
        }
        Returns: Json
      }
      crear_pieza_de_claude: {
        Args: {
          p_linea_version: number
          p_pedido: string
          p_planeada_para?: string
          p_texto: string
        }
        Returns: Json
      }
      crear_tema: {
        Args: {
          p_descripcion: string
          p_hallazgos: string[]
          p_minimo: number
          p_nombre: string
        }
        Returns: string
      }
      crear_vigilancia: {
        Args: { p_dia: string; p_temas: string[] }
        Returns: string
      }
      credencial_de_cuenta: {
        Args: { p_cuenta: string }
        Returns: {
          autor: string
          expira_en: string
          titular: string
          token: string
        }[]
      }
      cubrir_con_reserva: {
        Args: { p_pendiente: string; p_siguiente: string }
        Returns: string
      }
      descartar_hallazgo: { Args: { p_hallazgo: string }; Returns: undefined }
      descartar_idea: { Args: { p_idea: string }; Returns: undefined }
      descartar_informe: {
        Args: { p_investigacion: string }
        Returns: undefined
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
      editar_idea: {
        Args: { p_esqueleto: Json; p_gancho: string; p_idea: string }
        Returns: undefined
      }
      elegir_pagina: {
        Args: { p_eleccion: string; p_organizacion: string }
        Returns: string
      }
      es_dueno: { Args: { p_marca: string }; Returns: boolean }
      es_dueno_de_alguna: { Args: never; Returns: boolean }
      es_miembro: { Args: { p_marca: string }; Returns: boolean }
      esqueleto_valido: { Args: { p: Json }; Returns: boolean }
      fallar_asignacion: {
        Args: { p_asignacion: string; p_motivo: string }
        Returns: undefined
      }
      fecha_de_asignacion_valida: { Args: { p: string }; Returns: boolean }
      firmar_para_reserva: {
        Args: { p_huella: string; p_pieza: string }
        Returns: string
      }
      firmar_pieza: {
        Args: { p_huella: string; p_pieza: string; p_programada_para: string }
        Returns: string
      }
      fusionar_temas: { Args: { p_de: string; p_en: string }; Returns: boolean }
      gastado: { Args: { p_marca?: string; p_mes: string }; Returns: number }
      guardar_diseno: {
        Args: {
          p_archivo_ruta: string
          p_archivo_sha256: string
          p_pedido: string
          p_planeada_para?: string
        }
        Returns: Json
      }
      guardar_eleccion: {
        Args: {
          p_cuenta: string
          p_expira_en: string
          p_nombre: string
          p_paginas: Json
          p_renovacion?: string
          p_renovacion_expira_en?: string
          p_scopes: string[]
          p_titular: string
          p_token: string
        }
        Returns: string
      }
      guardar_hallazgo: {
        Args: {
          p_angulo?: string
          p_cita?: string
          p_enlace: string
          p_enlace_normalizado: string
          p_investigacion?: string
          p_medio: string
          p_publicado_en?: string
          p_resumen: string
          p_umbral_repetido: number
          p_umbral_tema: number
          p_vector: string
        }
        Returns: Json
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
      guardar_renovacion: {
        Args: {
          p_conexion: string
          p_expira_en: string
          p_renovacion: string
          p_renovacion_expira_en: string
          p_token: string
        }
        Returns: undefined
      }
      guardar_revision_ia: {
        Args: { p_pedido?: string; p_veredicto: Json; p_version: string }
        Returns: undefined
      }
      guardar_secreto: {
        Args: { p_nombre: string; p_valor: string }
        Returns: undefined
      }
      guardar_serie: {
        Args: { p_ideas: Json; p_investigacion: string }
        Returns: string[]
      }
      guardar_sugerencias: { Args: { p_sugerencias: Json }; Returns: undefined }
      guardar_tope: {
        Args: { p_marca?: string; p_monto_micro?: number }
        Returns: undefined
      }
      hallazgos_pendientes: {
        Args: { p_limite: number }
        Returns: {
          id: string
          resumen: string
          vector: string
        }[]
      }
      ideas_parecidas: {
        Args: { p_excepto?: string[]; p_umbral: number; p_vector: string }
        Returns: {
          estado: string
          gancho: string
          id: string
          similitud: number
        }[]
      }
      liberar_gasto: {
        Args: { p_ahora?: string; p_clave: string }
        Returns: string
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
      mes_de: { Args: { p_ahora: string }; Returns: string }
      mover_asignacion: {
        Args: { p_asignacion: string; p_fecha: string }
        Returns: undefined
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
      olvidar_renovacion: { Args: { p_conexion: string }; Returns: undefined }
      pedir_ampliacion: {
        Args: { p_angulo: string; p_investigacion: string }
        Returns: string
      }
      pedir_diseno: {
        Args: {
          p_cuenta: string
          p_diseno: Json
          p_pieza?: string
          p_tema: string
          p_texto: string
          p_titulo: string
        }
        Returns: string
      }
      pedir_diseno_de_asignacion: {
        Args: {
          p_asignacion: string
          p_diseno: Json
          p_linea_version: number
          p_planeada_para: string
          p_tema: string
          p_texto: string
          p_titulo: string
        }
        Returns: string
      }
      pedir_investigacion: {
        Args: {
          p_cantidad: number
          p_enfoque?: string
          p_formato: string
          p_tema: string
        }
        Returns: string
      }
      pedir_otra_idea: { Args: { p_idea: string }; Returns: string }
      pedir_reescritura: {
        Args: { p_instruccion: string; p_pieza: string }
        Returns: string
      }
      pedir_revision: { Args: { p_pieza: string }; Returns: string }
      pedir_serie: { Args: { p_investigacion: string }; Returns: string }
      pedir_texto: {
        Args: {
          p_cuenta: string
          p_encargo: string
          p_material?: string
          p_pilar?: string
        }
        Returns: string
      }
      pieza_para_pedido: {
        Args: { p_pieza: string }
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
        }
        SetofOptions: {
          from: "*"
          to: "piezas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilar_de_idea_en_cuenta: {
        Args: { p_cuenta: string; p_idea: string }
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
      recalcular_centroide: { Args: { p_tema: string }; Returns: undefined }
      registrar_falla_de_espacio: {
        Args: { p_motivo: string; p_pieza: string }
        Returns: boolean
      }
      renovaciones_pendientes: {
        Args: { p_hasta: string }
        Returns: {
          conexion: string
          expira_en: string
          renovacion: string
          renovacion_expira_en: string
        }[]
      }
      reservar_envio: {
        Args: { p_firma: string; p_pieza: string; p_version: string }
        Returns: string
      }
      reservar_gasto: {
        Args: {
          p_ahora?: string
          p_clave: string
          p_estimado_micro: number
          p_marca?: string
          p_paso: string
          p_proveedor: string
        }
        Returns: Json
      }
      resumen_de_gasto: { Args: never; Returns: Json }
      reubicar_pendientes: { Args: { p_umbral: number }; Returns: number }
      sacar_de_reserva: { Args: { p_pieza: string }; Returns: undefined }
      tema_de_la_voz: {
        Args: { p_tema: string; p_voz: string }
        Returns: boolean
      }
      tema_mas_cercano: {
        Args: { p_umbral: number; p_vector: string }
        Returns: string
      }
      temas_casi_iguales: {
        Args: { p_umbral: number }
        Returns: {
          hallazgos_a: number
          hallazgos_b: number
          similitud: number
          tema_a: string
          tema_b: string
        }[]
      }
      temas_cercanos: {
        Args: { p_cantidad: number; p_vector: string }
        Returns: {
          descripcion: string
          id: string
          nombre: string
          similitud: number
        }[]
      }
      terminar_pedido: {
        Args: { p_estado: string; p_motivo?: string; p_pedido: string }
        Returns: undefined
      }
      terminar_pedido_de_diseno: {
        Args: { p_estado: string; p_motivo: string; p_pedido: string }
        Returns: undefined
      }
      terminar_trabajo_de_investigacion: {
        Args: { p_estado: string; p_motivo?: string; p_trabajo: string }
        Returns: undefined
      }
      tiene_acceso: { Args: never; Returns: boolean }
      tomar_asignaciones: {
        Args: { p_hasta: string; p_limite: number }
        Returns: {
          arrendado_hasta: string | null
          creada_en: string
          cuenta_id: string
          estado: string
          formato: string
          id: string
          idea_id: string
          intentos: number
          motivo: string | null
          pedido_de_diseno_id: string | null
          pieza_id: string | null
          planeada_para: string
        }[]
        SetofOptions: {
          from: "*"
          to: "asignaciones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      tomar_pedidos: {
        Args: never
        Returns: {
          arrendado_hasta: string | null
          creado_en: string
          cuenta_id: string
          encargo: string | null
          estado: string
          id: string
          instruccion: string | null
          material: string | null
          motivo: string | null
          pedido_por: string
          pieza_id: string | null
          pilar_id: string | null
          resultado_pieza_id: string | null
          terminado_en: string | null
          tipo: string
          version_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pedidos_de_texto"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tomar_pedidos_de_diseno: {
        Args: never
        Returns: {
          arrendado_hasta: string | null
          asignacion_id: string | null
          creado_en: string
          cuenta_id: string
          diseno: Json
          estado: string
          id: string
          intentos: number
          linea_version: number | null
          motivo: string | null
          origen: string
          pedido_por: string
          pieza_id: string | null
          planeada_para: string | null
          resultado_pieza_id: string | null
          tema: string
          terminado_en: string | null
          texto: string
          titulo: string
          version_base_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pedidos_de_diseno"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tomar_trabajo_de_investigacion: {
        Args: never
        Returns: {
          angulo: string | null
          arrendado_hasta: string | null
          creado_en: string
          estado: string
          id: string
          idea_id: string | null
          intentos: number
          investigacion_id: string
          motivo: string | null
          terminado_en: string | null
          tipo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "trabajos_de_investigacion"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tope_vigente: {
        Args: { p_marca: string; p_mes: string }
        Returns: number
      }
      transiciones_de_pieza: {
        Args: never
        Returns: {
          a: string[]
          de: string
        }[]
      }
      umbrales_de: {
        Args: { p_frenado: boolean; p_marca: string; p_mes: string }
        Returns: Json
      }
      version_de_claude: {
        Args: { p_linea_version: number; p_pedido: string; p_texto: string }
        Returns: string
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


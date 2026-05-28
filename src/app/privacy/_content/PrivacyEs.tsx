/**
 * Cuerpo en español de `/privacy`. Traducción de la versión inglesa
 * `PrivacyEn.tsx` ajustada al contexto legal español (LOPDGDD + RGPD).
 *
 * Si necesitas añadir otro idioma, duplica este archivo y registra el
 * nuevo branch en el dispatcher del `page.tsx`.
 */
export function PrivacyEs() {
  return (
    <>
      <section>
        <h2>Resumen</h2>
        <p>
          Montana guarda los datos mínimos necesarios para operar un mapa
          comunitario de incidencias en montaña: tu email, las incidencias
          que publicas y las fotos que adjuntas. No vendemos nada a nadie.
          No usamos cookies de seguimiento ni publicidad.
        </p>
      </section>

      <section>
        <h2>1. Responsable del tratamiento</h2>
        <p>
          La entidad responsable del tratamiento de tus datos personales en
          virtud del Reglamento (UE) 2016/679 (&laquo;RGPD&raquo;) y la
          LOPDGDD es la operadora del proyecto Montana. Puedes contactar
          con el responsable en el email publicado en el README del
          repositorio.
        </p>
      </section>

      <section>
        <h2>2. Qué recogemos y base legal</h2>
        <table className="legal__table">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Finalidad</th>
              <th>Base legal (art. 6 RGPD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Dirección de email (+ contraseña hasheada o identificador
                OAuth)
              </td>
              <td>Autenticación, recuperación de cuenta</td>
              <td>Ejecución de contrato — art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>
                Incidencias que creas (tipo, gravedad, título, descripción,
                coordenadas, altitud, fotos)
              </td>
              <td>Renderizado del mapa compartido, operación del servicio</td>
              <td>Ejecución de contrato — art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Votos sobre incidencias</td>
              <td>Ranking comunitario y moderación</td>
              <td>Interés legítimo — art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Logs del servidor (IP, user agent, marca temporal)</td>
              <td>Seguridad, prevención de abusos, depuración</td>
              <td>Interés legítimo — art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Analítica agregada y anónima</td>
              <td>Entender patrones de tráfico</td>
              <td>Interés legítimo — art. 6(1)(f)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. Qué NO recogemos</h2>
        <ul>
          <li>
            Seguimiento de ubicación en tiempo real. La geolocalización solo
            se lee desde tu navegador cuando tú la activas explícitamente.
          </li>
          <li>
            Contactos, calendario, micrófono ni ningún otro permiso a nivel
            de dispositivo.
          </li>
          <li>
            Tracking entre sitios. No usamos cookies publicitarias de
            terceros ni fingerprinting.
          </li>
          <li>
            Categorías especiales de datos del art. 9 RGPD (salud,
            religión, etnia, etc.).
          </li>
          <li>
            <strong>Metadatos EXIF de las fotos.</strong> Cuando adjuntas
            una foto a una incidencia, tu navegador la re-codifica antes
            de subirla. El archivo re-codificado que recibimos{' '}
            <strong>no tiene metadatos EXIF</strong> — las coordenadas
            GPS, modelo de cámara, fecha y demás campos que tu teléfono
            embebe por defecto se eliminan en cliente y nunca llegan a
            nuestros servidores. Los únicos datos de ubicación que
            guardamos son el pin del mapa que tú colocaste.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Quién trata tus datos (encargados)</h2>
        <ul>
          <li>
            <strong>Supabase (región UE)</strong> — base de datos,
            autenticación, almacenamiento de objetos. Contrato de
            encargado del tratamiento firmado.
          </li>
          <li>
            <strong>Vercel</strong> — hosting de la aplicación y analítica
            sin cookies.
          </li>
          <li>
            <strong>MapTiler</strong> — teselas de mapa y terreno. Solo
            recibe peticiones de teselas, no datos de tu cuenta.
          </li>
          <li>
            <strong>Google (solo si eliges &quot;Continuar con
            Google&quot;)</strong> — autenticación delegada vía OAuth
            2.0. Cuando inicias sesión con Google, recibimos
            únicamente tu dirección de email y el identificador
            estable de tu cuenta de Google. No recibimos contraseñas
            ni acceso a tu Gmail, contactos, Drive ni ningún otro
            servicio. Google, por su parte, recibe la información
            mínima necesaria para autenticarte (que existe una
            aplicación llamada Montana que solicita autenticación).
            Consulta la{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              política de privacidad de Google
            </a>{' '}
            para más detalles.
          </li>
        </ul>
        <p>
          Algunos encargados pueden almacenar copias de seguridad fuera del
          EEE. Las transferencias están cubiertas por las Cláusulas
          Contractuales Tipo (CCT) aprobadas por la Comisión Europea.
        </p>
      </section>

      <section>
        <h2>5. Conservación</h2>
        <ul>
          <li>
            Datos de cuenta: mientras tu cuenta exista. Eliminados en un
            plazo de 30 días desde la solicitud de baja.
          </li>
          <li>
            Incidencias que has publicado: mientras sean relevantes, o
            hasta 12 meses tras su caducidad.
          </li>
          <li>Logs del servidor: hasta 30 días.</li>
          <li>
            Votos: se mantienen como contadores anónimos; los vínculos con
            el usuario se eliminan al borrar la cuenta.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Tus derechos (art. 15–22 RGPD)</h2>
        <ul>
          <li>
            <strong>Acceso</strong>: solicitar una copia de tus datos.
          </li>
          <li>
            <strong>Rectificación</strong>: corregir datos inexactos.
          </li>
          <li>
            <strong>Supresión</strong> (&laquo;derecho al olvido&raquo;):
            borrar tus datos.
          </li>
          <li>
            <strong>Limitación</strong>: pausar el tratamiento mientras
            disputas la exactitud de los datos.
          </li>
          <li>
            <strong>Portabilidad</strong>: recibir tus datos en un formato
            estructurado y legible por máquina.
          </li>
          <li>
            <strong>Oposición</strong>: oponerte al tratamiento basado en
            interés legítimo.
          </li>
          <li>
            <strong>Retirar el consentimiento</strong>: en cualquier
            momento, cuando aplique.
          </li>
        </ul>
        <p>
          Para ejercer cualquier derecho, escríbenos por email. Respondemos
          en un plazo de 30 días según exige el art. 12 RGPD. También
          tienes derecho a presentar una reclamación ante la autoridad de
          control española, la{' '}
          <strong>Agencia Española de Protección de Datos (AEPD)</strong>,
          en{' '}
          <a
            href="https://www.aepd.es"
            target="_blank"
            rel="noopener noreferrer"
          >
            aepd.es
          </a>
          .
        </p>
      </section>

      <section>
        <h2>7. Reportes comunitarios y moderación</h2>
        <p>
          Cuando envías un reporte sobre la incidencia de otro usuario,
          guardamos el ID de la incidencia objetivo, el motivo que
          seleccionaste y cualquier texto libre que añadas, vinculados a
          tu cuenta. Estos datos se usan únicamente para moderar el
          servicio (eliminar contenido abusivo o falso) y se tratan en
          base a <strong>interés legítimo</strong> (art. 6(1)(f) RGPD) —
          mantener la comunidad segura. Los reportes se conservan hasta 12
          meses y luego se eliminan. Solo quien reporta y nuestro equipo
          de moderación los pueden leer; los usuarios reportados no ven
          quién los reportó.
        </p>
      </section>

      <section>
        <h2>8. Cookies</h2>
        <p>
          Montana solo usa cookies estrictamente necesarias (sesión de
          autenticación). Sin cookies publicitarias ni de seguimiento.
          Consulta nuestra <a href="/cookies">Política de Cookies</a> para
          ver la lista completa.
        </p>
      </section>

      <section>
        <h2>9. Menores</h2>
        <p>
          Montana no está dirigido a menores de 14 años. No recogemos
          deliberadamente datos personales de menores de 14 años sin el
          consentimiento de quien ostente la patria potestad o tutela,
          conforme exige el art. 7 LOPDGDD.
        </p>
      </section>

      <section>
        <h2>10. Cambios</h2>
        <p>
          Notificamos los cambios sustanciales mediante un aviso dentro de
          la app y actualizando la fecha de &laquo;Última
          actualización&raquo; al inicio. Continuar usando el servicio
          tras un cambio implica su aceptación.
        </p>
      </section>
    </>
  );
}

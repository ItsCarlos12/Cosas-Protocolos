from pathlib import Path

from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer


BASE_DIR = Path(__file__).resolve().parent
FTP_ROOT = BASE_DIR / "ftp_root"


def main() -> None:
    # Asegurarse de que exista la carpeta raíz para los archivos
    FTP_ROOT.mkdir(exist_ok=True)

    # Configurar usuarios y permisos
    authorizer = DummyAuthorizer()

    # Usuario normal con permisos completos sobre ftp_root
    # Permisos: e=LIST, l=LIST detallado, r=LEER, a=APÉNDICE, d=BORRAR,
    # f=RENOMBRAR, m=CREAR DIR, w=ESCRIBIR, M=CAMBIAR MODO, T=CAMBIAR TIEMPO
    authorizer.add_user("user", "12345", str(FTP_ROOT), perm="elradfmwMT")

    # Opcional: usuario anónimo solo lectura sobre ftp_root
    # authorizer.add_anonymous(str(FTP_ROOT), perm="elr")

    handler = FTPHandler
    handler.authorizer = authorizer
    handler.banner = "Servidor FTP simple para manejo de archivos"

    # Usar un puerto >1024 para evitar permisos de administrador
    address = ("127.0.0.1", 2121)
    server = FTPServer(address, handler)

    # Límite de conexiones
    server.max_cons = 10
    server.max_cons_per_ip = 5

    print("==============================")
    print("  Servidor FTP en ejecución")
    print("==============================")
    print(f"Host: {address[0]}")
    print(f"Puerto: {address[1]}")
    print(f"Directorio raíz: {FTP_ROOT}")
    print("Usuario: user")
    print("Contraseña: 12345")
    print("(Pulsa Ctrl+C para detener el servidor)")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")


if __name__ == "__main__":
    main()

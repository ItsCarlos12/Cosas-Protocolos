import ftplib
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog


HOST = "127.0.0.1"
PORT = 2121
USER = "user"
PASSWORD = "12345"


class FTPClientGUI:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Cliente FTP - Gestor de archivos")
        self.ftp: ftplib.FTP | None = None

        # Marco superior: información de conexión
        top_frame = tk.Frame(root)
        top_frame.pack(fill=tk.X, padx=10, pady=5)

        self.status_label = tk.Label(top_frame, text="Desconectado", fg="red")
        self.status_label.pack(side=tk.LEFT)

        self.current_dir_label = tk.Label(top_frame, text="Directorio: -")
        self.current_dir_label.pack(side=tk.RIGHT)

        # Lista de archivos remotos
        middle_frame = tk.Frame(root)
        middle_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        scrollbar = tk.Scrollbar(middle_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.listbox = tk.Listbox(middle_frame, height=15)
        self.listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.listbox.config(yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.listbox.yview)

        # Botones de acciones
        button_frame = tk.Frame(root)
        button_frame.pack(fill=tk.X, padx=10, pady=5)

        tk.Button(button_frame, text="Refrescar", command=self.refresh_list).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Subir archivo", command=self.upload_file).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Descargar archivo", command=self.download_file).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Eliminar", command=self.delete_file).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Crear carpeta", command=self.create_directory).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Eliminar carpeta", command=self.delete_directory).pack(side=tk.LEFT, padx=2)
        tk.Button(button_frame, text="Cambiar dir", command=self.change_directory).pack(side=tk.LEFT, padx=2)

        # Cerrar conexión al cerrar ventana
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Conectar automáticamente al iniciar
        self.connect()

    def connect(self) -> None:
        if self.ftp is not None:
            # Ya está conectado, solo refrescar
            self.refresh_list()
            return

        try:
            ftp = ftplib.FTP()
            ftp.connect(HOST, PORT, timeout=10)
            ftp.login(USER, PASSWORD)
            self.ftp = ftp
            self.status_label.config(text=f"Conectado a {HOST}:{PORT} como {USER}", fg="green")
            self.update_current_dir()
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error de conexión", f"No se pudo conectar al servidor FTP:\n{e}")
            self.status_label.config(text="Desconectado", fg="red")
            self.ftp = None

    def ensure_connected(self) -> bool:
        if self.ftp is None:
            messagebox.showwarning("No conectado", "Primero debes conectarte al servidor FTP.")
            return False
        return True

    def update_current_dir(self) -> None:
        if self.ftp is not None:
            try:
                current = self.ftp.pwd()
                self.current_dir_label.config(text=f"Directorio: {current}")
            except ftplib.all_errors:
                self.current_dir_label.config(text="Directorio: -")

    def refresh_list(self) -> None:
        if not self.ensure_connected():
            return

        self.listbox.delete(0, tk.END)

        lines: list[str] = []

        def collect(line: str) -> None:
            lines.append(line)

        try:
            self.ftp.dir(collect)
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo listar el directorio remoto:\n{e}")
            return

        for line in lines:
            self.listbox.insert(tk.END, line)

    def get_selected_name(self) -> str | None:
        if not self.listbox.curselection():
            messagebox.showinfo("Selección requerida", "Selecciona un archivo o directorio de la lista.")
            return None
        item = self.listbox.get(self.listbox.curselection()[0])
        # Formato típico: "-rw-r--r--   1 owner    group           0 Feb 19 12:34 nombre.ext"
        parts = item.split(maxsplit=8)
        if len(parts) == 9:
            return parts[8]
        # Si no reconoce el formato, pedirlo manualmente
        name = simpledialog.askstring("Nombre", "No se pudo obtener el nombre automáticamente. Escribe el nombre remoto:")
        return name

    def upload_file(self) -> None:
        if not self.ensure_connected():
            return

        local_path_str = filedialog.askopenfilename(title="Selecciona archivo para subir")
        if not local_path_str:
            return

        local_path = Path(local_path_str)

        remote_name = simpledialog.askstring(
            "Nombre remoto",
            f"Nombre de archivo en el servidor (deja vacío para usar '{local_path.name}'):",
        )
        if not remote_name:
            remote_name = local_path.name

        try:
            with local_path.open("rb") as f:
                self.ftp.storbinary(f"STOR {remote_name}", f)
            messagebox.showinfo("Éxito", f"Archivo subido como '{remote_name}'.")
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo subir el archivo:\n{e}")

    def download_file(self) -> None:
        if not self.ensure_connected():
            return

        remote_name = self.get_selected_name()
        if not remote_name:
            return

        initial_name = remote_name
        local_path_str = filedialog.asksaveasfilename(title="Guardar archivo como", initialfile=initial_name)
        if not local_path_str:
            return

        local_path = Path(local_path_str)

        try:
            with local_path.open("wb") as f:
                self.ftp.retrbinary(f"RETR {remote_name}", f.write)
            messagebox.showinfo("Éxito", f"Archivo descargado como '{local_path}'.")
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo descargar el archivo:\n{e}")

    def delete_file(self) -> None:
        if not self.ensure_connected():
            return

        remote_name = self.get_selected_name()
        if not remote_name:
            return

        if not messagebox.askyesno("Confirmar", f"¿Seguro que deseas eliminar '{remote_name}'?"):
            return

        try:
            self.ftp.delete(remote_name)
            messagebox.showinfo("Éxito", f"Archivo '{remote_name}' eliminado.")
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo eliminar el archivo:\n{e}")

    def change_directory(self) -> None:
        if not self.ensure_connected():
            return

        new_dir = simpledialog.askstring("Cambiar directorio", "Ruta de directorio remoto (por ejemplo / o /subcarpeta):")
        if not new_dir:
            return

        try:
            self.ftp.cwd(new_dir)
            self.update_current_dir()
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo cambiar de directorio:\n{e}")

    def create_directory(self) -> None:
        if not self.ensure_connected():
            return

        dir_name = simpledialog.askstring("Crear carpeta", "Nombre de la nueva carpeta (relativo al directorio actual):")
        if not dir_name:
            return

        try:
            self.ftp.mkd(dir_name)
            messagebox.showinfo("Éxito", f"Carpeta '{dir_name}' creada.")
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo crear la carpeta:\n{e}")

    def delete_directory(self) -> None:
        if not self.ensure_connected():
            return

        dir_name = self.get_selected_name()
        if not dir_name:
            return

        if not messagebox.askyesno("Confirmar", f"¿Seguro que deseas eliminar la carpeta '{dir_name}'? (Debe estar vacía)"):
            return

        try:
            self.ftp.rmd(dir_name)
            messagebox.showinfo("Éxito", f"Carpeta '{dir_name}' eliminada.")
            self.refresh_list()
        except ftplib.all_errors as e:
            messagebox.showerror("Error", f"No se pudo eliminar la carpeta (asegúrate de que esté vacía):\n{e}")

    def on_close(self) -> None:
        if self.ftp is not None:
            try:
                self.ftp.quit()
            except Exception:
                pass
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    FTPClientGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()

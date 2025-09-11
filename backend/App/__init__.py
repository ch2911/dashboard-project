from flask import Flask

class DashboardBackend(Flask):
    def __init__(self, import_name: str, template_folder: None=None, root_path: None=None):
        super().__init__(import_name, template_folder, root_path)


app = DashboardBackend(__name__)
# Clean Code dialog: paste decoded serial, get cleaned (grouped) code to copy back.
from PyQt6 import QtWidgets, QtCore, QtGui

import decoder_logic


def open_clean_code_dialog(parent=None, initial_text: str = ""):
    """Open the Clean Code dialog. initial_text pre-fills the input (e.g. current decoded from tab)."""
    dlg = QtWidgets.QDialog(parent)
    dlg.setWindowTitle("Clean Code")
    dlg.setMinimumSize(520, 400)
    layout = QtWidgets.QVBoxLayout(dlg)
    layout.setSpacing(8)

    layout.addWidget(QtWidgets.QLabel("Paste your decoded code below, then click Clean. Copy the output back into your build."))
    layout.addWidget(QtWidgets.QLabel("Input:"))
    input_edit = QtWidgets.QPlainTextEdit()
    input_edit.setPlaceholderText("9, 0, 1, 50| 2, 1253|| {83} {82} {62} ...")
    if initial_text:
        input_edit.setPlainText(initial_text)
    input_edit.setMinimumHeight(120)
    layout.addWidget(input_edit)

    layout.addWidget(QtWidgets.QLabel("Output (cleaned):"))
    output_edit = QtWidgets.QPlainTextEdit()
    output_edit.setReadOnly(True)
    output_edit.setMinimumHeight(120)
    layout.addWidget(output_edit)

    def do_clean():
        reply = QtWidgets.QMessageBox.question(
            dlg,
            "Clean Code",
            "Are you sure? This will combine like codes (e.g. group simple parts under the first number, merge same-index lists).",
            QtWidgets.QMessageBox.StandardButton.Yes | QtWidgets.QMessageBox.StandardButton.No,
            QtWidgets.QMessageBox.StandardButton.Yes,
        )
        if reply != QtWidgets.QMessageBox.StandardButton.Yes:
            return
        raw = input_edit.toPlainText().strip()
        if not raw:
            output_edit.setPlainText("(Paste code in the input box first.)")
            return
        cleaned, err = decoder_logic.clean_decoded_string(raw)
        if err:
            output_edit.setPlainText(f"Error: {err}")
            return
        output_edit.setPlainText(cleaned)

    def copy_output():
        text = output_edit.toPlainText()
        if text:
            QtWidgets.QApplication.clipboard().setText(text)

    btn_row = QtWidgets.QHBoxLayout()
    clean_btn = QtWidgets.QPushButton("Clean Code")
    clean_btn.clicked.connect(do_clean)
    copy_btn = QtWidgets.QPushButton("Copy output")
    copy_btn.clicked.connect(copy_output)
    close_btn = QtWidgets.QPushButton("Close")
    close_btn.clicked.connect(dlg.accept)
    btn_row.addWidget(clean_btn)
    btn_row.addWidget(copy_btn)
    btn_row.addStretch()
    btn_row.addWidget(close_btn)
    layout.addLayout(btn_row)

    dlg.exec()

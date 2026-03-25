from codec.b4s.serial_datatypes.varint.write import write as write_varint
from codec.lib.bit.writer import Writer
from codec.lib.byte_mirror import UINT7_MIRROR

def write_b4string(bw: Writer, s: str):
    str_bytes = s.encode('utf-8')
    write_varint(bw, len(str_bytes))

    for byte in str_bytes:
        mirrored_byte = UINT7_MIRROR[byte]
        bw.write_n(mirrored_byte, 7)

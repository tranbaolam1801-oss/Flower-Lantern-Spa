import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { LichHen } from './lich-hen.entity';
import { KhachHang } from './khach-hang.entity';
import { DichVu } from './dich-vu.entity';
import { PhanHoi } from './phan-hoi.entity';

@Entity({ name: 'DanhGia' })
export class DanhGia {
  @PrimaryColumn({ name: 'MaDanhGia', type: 'char', length: 10 })
  maDanhGia!: string;

  @Column({ name: 'MaLichHen', type: 'char', length: 10, unique: true })
  maLichHen!: string;

  @Column({ name: 'MaKhachHang', type: 'char', length: 10 })
  maKhachHang!: string;

  @Column({ name: 'MaDichVu', type: 'char', length: 10 })
  maDichVu!: string;

  @Column({ name: 'SoSao', type: 'tinyint' })
  soSao!: number;

  @Column({ name: 'NoiDungDanhGia', type: 'nvarchar', length: 1000, nullable: true })
  noiDungDanhGia?: string;

  @Column({ name: 'NgayDanhGia', type: 'datetime', default: () => 'GETDATE()' })
  ngayDanhGia!: Date;

  @ManyToOne(() => LichHen, (lh) => lh.danhGias)
  @JoinColumn({ name: 'MaLichHen' })
  lichHen?: LichHen;

  @ManyToOne(() => KhachHang, (kh) => kh.danhGias)
  @JoinColumn({ name: 'MaKhachHang' })
  khachHang?: KhachHang;

  @ManyToOne(() => DichVu, (dv) => dv.danhGias)
  @JoinColumn({ name: 'MaDichVu' })
  dichVu?: DichVu;

  @OneToMany(() => PhanHoi, (ph) => ph.danhGia)
  phanHois?: PhanHoi[];
}

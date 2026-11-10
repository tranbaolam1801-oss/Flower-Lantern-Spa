import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DanhGia } from './danh-gia.entity';
import { NhanVien } from './nhan-vien.entity';

@Entity({ name: 'PhanHoi' })
export class PhanHoi {
  @PrimaryColumn({ name: 'MaPhanHoi', type: 'char', length: 10 })
  maPhanHoi!: string;

  @Column({ name: 'MaDanhGia', type: 'char', length: 10, unique: true })
  maDanhGia!: string;

  @Column({ name: 'MaNhanVien', type: 'char', length: 10 })
  maNhanVien!: string;

  @Column({ name: 'NoiDungPhanHoi', type: 'nvarchar', length: 1000 })
  noiDungPhanHoi!: string;

  @ManyToOne(() => DanhGia, (dg) => dg.phanHois)
  @JoinColumn({ name: 'MaDanhGia' })
  danhGia?: DanhGia;

  @ManyToOne(() => NhanVien, (nv) => nv.phanHois)
  @JoinColumn({ name: 'MaNhanVien' })
  nhanVien?: NhanVien;
}

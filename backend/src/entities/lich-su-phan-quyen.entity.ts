import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';

@Entity({ name: 'LichSuPhanQuyen' })
export class LichSuPhanQuyen {
  @PrimaryColumn({ name: 'MaLichSu', type: 'char', length: 10 })
  maLichSu!: string;

  @Column({ name: 'MaTaiKhoanThucHien', type: 'char', length: 10 })
  maTaiKhoanThucHien!: string;

  @Column({ name: 'MaTaiKhoanDuocPhanQuyen', type: 'char', length: 10 })
  maTaiKhoanDuocPhanQuyen!: string;

  @Column({ name: 'ThoiDiem', type: 'datetime' })
  thoiDiem!: Date;

  @Column({ name: 'NoiDungThayDoi', type: 'nvarchar', length: 500, nullable: true })
  noiDungThayDoi?: string;

  @ManyToOne(() => TaiKhoan)
  @JoinColumn({ name: 'MaTaiKhoanThucHien' })
  taiKhoanThucHien?: TaiKhoan;

  @ManyToOne(() => TaiKhoan)
  @JoinColumn({ name: 'MaTaiKhoanDuocPhanQuyen' })
  taiKhoanDuocPhanQuyen?: TaiKhoan;
}

import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { TaiKhoanQuyen } from './tai-khoan-quyen.entity';

@Entity({ name: 'Quyen' })
export class Quyen {
  @PrimaryColumn({ name: 'MaQuyen', type: 'char', length: 10 })
  maQuyen!: string;

  @Column({ name: 'TenQuyen', type: 'nvarchar', length: 100, unique: true })
  tenQuyen!: string;

  @OneToMany(() => TaiKhoanQuyen, (tq) => tq.quyen)
  taiKhoanQuyens?: TaiKhoanQuyen[];
}

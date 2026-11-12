import { Entity, PrimaryColumn, OneToMany } from 'typeorm';
import { KhachSuDungDichVu } from './khach-su-dung-dich-vu.entity';

@Entity({ schema: 'dbo', name: 'giuong' })
export class Giuong {
  @PrimaryColumn({ name: 'magiuong', type: 'char', length: 10 })
  maGiuong!: string;

  @OneToMany(() => KhachSuDungDichVu, (ksd) => ksd.giuong)
  khachSuDungDichVus?: KhachSuDungDichVu[];
}
